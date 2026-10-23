import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  AlertTriangle,
  ExternalLink,
  RotateCcw,
  ArrowRight,
  PhoneCall,
  Upload,
  FileImage,
  Database,
  Send,
  Lock,
  X,
  Activity,
  Pill,
  FileText,
  Zap,
  Copy,
  Check,
  Globe,
} from 'lucide-react';
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { encryptPatientPayload } from '../lib/cryptoVault';
import {
  STORAGE_KEYS,
  readLocalStorage,
  writeLocalStorage,
  HealthGuideCachedState,
} from '../lib/storageCache';
import { GroundedSourceCitation, EmergencyCheckResult, getSafeCitationUrl } from '../shared/clinicalCore';
import { SYNTHETIC_LAB_REPORTS, SYNTHETIC_CLINICAL_NOTES } from '../shared/sampleData';

export interface RealtimeClinicalDatasetPayload {
  queryTerm: string;
  fetchedAt: string;
  latencyMs: number;
  icd10Conditions: Array<{ code: string; name: string }>;
  rxNormMedications: Array<{ name: string; strengths: string[] }>;
  pubmedTotalHits: number;
  pubmedArticles: Array<{
    pmid: string;
    title: string;
    journal: string;
    pubYear: string;
    url: string;
  }>;
}

interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  latencyMs?: number;
  imagePreview?: string;
  imageName?: string;
  citations?: GroundedSourceCitation[];
  realtimeDataset?: RealtimeClinicalDatasetPayload;
  searchQueries?: string[];
  searchPerformed?: boolean;
  groundingEngine?: string;
  isEmergency?: boolean;
  emergencyCheck?: EmergencyCheckResult;
  followUpSuggestions?: string[];
  uncertaintyNotice?: string;
}

interface HealthGuideModuleProps {
  language: 'en' | 'te';
  initialQuery?: string;
  searchSubmissionId?: number;
  currentUser?: User | null;
  onSendToHealthAccess?: (text: string) => void;
}

const SAMPLE_QUESTIONS = [
  {
    en: 'What are the current WHO and MoHFW guidelines for dengue fever prevention and warning signs?',
    te: 'డెంగ్యూ జ్వరం నివారణ మరియు ప్రమాద సంకేతాలపై WHO మరియు ఆరోగ్య మంత్రిత్వ శాఖ మార్గదర్శకాలు ఏమిటి?',
    tag: 'Dengue Guidelines & Live Dataset',
  },
  {
    en: 'Analyze my connected medical record lab values (HbA1c 7.1%, Fasting Glucose 134 mg/dL) and explain what they mean.',
    te: 'నా ల్యాబ్ రిపోర్ట్ విలువలను (HbA1c 7.1%, Fasting Glucose 134 mg/dL) విశ్లేషించి సరళమైన భాషలో వివరించండి.',
    tag: 'Medical Record Lab Analysis',
  },
  {
    en: 'What are the standard clinical management principles and RxNorm options for hypertension and hyperlipidemia?',
    te: 'అధిక రక్తపోటు (Hypertension) మరియు కొలెస్ట్రాల్ నియంత్రణకు ప్రధాన ఆరోగ్య మార్గదర్శకాలు ఏమిటి?',
    tag: 'Hypertension & RxNorm Dataset',
  },
  {
    en: 'I have severe crushing chest pain radiating to my left arm and shortness of breath.',
    te: 'నాకు తీవ్రమైన ఛాతీ నొప్పి మరియు శ్వాస తీసుకోవడంలో ఇబ్బందిగా ఉంది.',
    tag: 'Emergency Red-Flag Triage',
  },
];

const DEFAULT_WELCOME_TURN = (language: 'en' | 'te'): ConversationTurn => ({
  id: 'welcome_turn',
  role: 'assistant',
  text:
    language === 'te'
      ? 'నమస్కారం! నేను HealthBridge AI రియల్-టైమ్ హెల్త్‌కేర్ అసిస్టెంట్. మీరు ఏదైనా ఆరోగ్య ప్రశ్న అడగవచ్చు, మెడికల్ రిపోర్ట్ లేదా స్కాన్ చిత్రాన్ని (Image) అప్‌లోడ్ చేసి తక్షణ విశ్లేషణ పొందవచ్చు, లేదా NIH ICD-10-CM, RxNorm మరియు PubMed రియల్-టైమ్ డేటాసెట్‌లను శోధించవచ్చు.'
      : 'Welcome to HealthBridge AI. Ask any health or clinical question with live NIH NLM ICD-10-CM, RxNorm, and PubMed dataset grounding, upload a diagnostic report image for instant verification, or cross-reference your connected medical record database.',
  timestamp: 'Ready',
  followUpSuggestions: [
    'What are the WHO guidelines for dengue fever prevention and warning signs?',
    'Analyze my connected medical record lab values in plain English and Telugu',
    'How should I prepare for a fasting blood sugar and lipid profile test?',
  ],
  uncertaintyNotice:
    'High-Speed Gemini Clinical Engine · Live NIH ICD-10-CM, RxNorm & PubMed Datasets · Multimodal Image Verifier · Encrypted Firestore Vault',
});

function renderTextWithCitationLinks(
  text: string,
  citations?: GroundedSourceCitation[],
  onSelectCitation?: (cit: GroundedSourceCitation) => void
): React.ReactNode {
  if (!text) return '';
  if (!citations || citations.length === 0) return text;

  // Support single [1] and comma-separated citations [1, 2, 3]
  const regex = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const matchIndex = match.index;
    const fullMatch = match[0];
    const rawNumbers = match[1]
      .split(',')
      .map((item) => parseInt(item.trim(), 10))
      .filter((n) => !isNaN(n));

    if (matchIndex > lastIndex) {
      parts.push(text.substring(lastIndex, matchIndex));
    }

    if (rawNumbers.length > 0) {
      rawNumbers.forEach((citationNum, subIdx) => {
        const citationIndex = citationNum - 1;
        if (citationIndex >= 0 && citationIndex < citations.length) {
          const cit = citations[citationIndex];
          const sourceUrl = getSafeCitationUrl(cit.uri, cit.title);
          parts.push(
            <a
              key={`cit-inline-${citationNum}-${matchIndex}-${subIdx}`}
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onSelectCitation?.(cit)}
              aria-label={`Open external source citation [${citationNum}]: ${cit.title} on ${cit.organization || 'External Source'}`}
              title={`[${citationNum}] ${cit.title}\nSource: ${cit.organization || 'Verified Authority'}\nURL: ${sourceUrl}\nClick to open in a new tab ↗`}
              className="inline-flex items-center align-baseline px-1.5 py-0.5 mx-0.5 text-[11px] font-mono font-bold text-teal-700 hover:text-teal-950 bg-teal-50 hover:bg-teal-100 border border-teal-300 rounded transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
            >
              [{citationNum}] ↗
            </a>
          );
        } else {
          parts.push(`[${citationNum}]`);
        }
      });
    } else {
      parts.push(fullMatch);
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}

interface AssistantTurnTextProps {
  text: string;
  citations?: GroundedSourceCitation[];
  onSelectCitation?: (cit: GroundedSourceCitation) => void;
}

const AssistantTurnText: React.FC<AssistantTurnTextProps> = React.memo(
  ({ text, citations, onSelectCitation }) => {
    const content = useMemo(() => {
      return renderTextWithCitationLinks(text, citations, onSelectCitation);
    }, [text, citations, onSelectCitation]);

    return <div className="text-sm whitespace-pre-line leading-relaxed">{content}</div>;
  }
);

const HealthGuideModuleComponent: React.FC<HealthGuideModuleProps> = ({
  language,
  initialQuery = '',
  searchSubmissionId = 0,
  currentUser = null,
  onSendToHealthAccess,
}) => {
  const cachedState = useRef<HealthGuideCachedState | null>(
    readLocalStorage<HealthGuideCachedState | null>(STORAGE_KEYS.HEALTHGUIDE_STATE, null)
  ).current;

  const [queryText, setQueryText] = useState<string>(
    () => initialQuery || cachedState?.queryText || ''
  );
  const [useSearchGrounding, setUseSearchGrounding] = useState<boolean>(
    () => cachedState?.useSearchGrounding ?? true
  );
  const [connectMedicalRecordsDb, setConnectMedicalRecordsDb] = useState<boolean>(
    () => cachedState?.connectMedicalRecordsDb ?? true
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<GroundedSourceCitation | null>(null);

  // Live Real-Time Clinical Dataset Search Bar State (NIH ICD-10-CM + RxNorm + PubMed)
  const [datasetQuery, setDatasetQuery] = useState<string>(
    () => cachedState?.datasetQuery || 'diabetes'
  );
  const [liveDataset, setLiveDataset] = useState<RealtimeClinicalDatasetPayload | null>(
    () => cachedState?.liveDataset || null
  );
  const [datasetLoading, setDatasetLoading] = useState(false);

  // Real-Time Image Upload State inside Chatbot
  const [attachedImageBase64, setAttachedImageBase64] = useState<string>('');
  const [attachedImageMime, setAttachedImageMime] = useState<string>('image/png');
  const [attachedImageName, setAttachedImageName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Connected Firestore Medical Records count & save status
  const [userRecordCount, setUserRecordCount] = useState(0);
  const [saveVaultMsg, setSaveVaultMsg] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const handleCopyCitationUrl = useCallback((url: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!url) return;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopiedUrl(url);
        setTimeout(() => {
          setCopiedUrl((prev) => (prev === url ? null : prev));
        }, 2200);
      })
      .catch(() => {});
  }, []);

  const [turns, setTurns] = useState<ConversationTurn[]>(() =>
    cachedState?.turns && cachedState.turns.length > 0
      ? cachedState.turns
      : [DEFAULT_WELCOME_TURN(language)]
  );

  const lastExecutedGlobalSearchRef = useRef<string>(
    cachedState?.lastExecutedGlobalSearch || ''
  );
  const lastSubmissionIdRef = useRef<number>(0);

  // Persist non-sensitive HealthGuide state to localStorage
  useEffect(() => {
    const sanitizedTurns = turns.slice(-8).map(({ imagePreview, ...rest }) => rest);
    writeLocalStorage<HealthGuideCachedState>(STORAGE_KEYS.HEALTHGUIDE_STATE, {
      queryText,
      datasetQuery,
      liveDataset,
      useSearchGrounding,
      connectMedicalRecordsDb,
      turns: sanitizedTurns,
      lastExecutedGlobalSearch: lastExecutedGlobalSearchRef.current,
    });
  }, [queryText, datasetQuery, liveDataset, useSearchGrounding, connectMedicalRecordsDb, turns]);

  const fetchLiveClinicalDataset = async (term: string) => {
    const clean = term.trim();
    if (!clean) return;
    setDatasetLoading(true);
    try {
      const res = await fetch(`/api/realtime-datasets?q=${encodeURIComponent(clean)}`);
      if (res.ok) {
        const data: RealtimeClinicalDatasetPayload = await res.json();
        setLiveDataset(data);
      }
    } catch {
      // Non-fatal
    } finally {
      setDatasetLoading(false);
    }
  };

  useEffect(() => {
    if (!liveDataset) {
      fetchLiveClinicalDataset(datasetQuery || 'diabetes');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const trimmed = initialQuery.trim();
    if (!trimmed || trimmed.length <= 1) return;

    const isNewExplicitSubmission =
      searchSubmissionId > 0 && searchSubmissionId !== lastSubmissionIdRef.current;
    const isUnseenInitialQuery =
      searchSubmissionId === 0 && trimmed !== lastExecutedGlobalSearchRef.current && turns.length <= 1;

    if (isNewExplicitSubmission || isUnseenInitialQuery) {
      lastSubmissionIdRef.current = searchSubmissionId;
      lastExecutedGlobalSearchRef.current = trimmed;
      setQueryText(trimmed);
      setDatasetQuery(trimmed);
      fetchLiveClinicalDataset(trimmed);
      handleAsk(trimmed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, searchSubmissionId]);

  useEffect(() => {
    if (!currentUser || !currentUser.emailVerified) {
      setUserRecordCount(0);
      return;
    }
    const q = query(collection(db, 'patient_records'), where('ownerId', '==', currentUser.uid));
    const unsub = onSnapshot(
      q,
      (snap) => setUserRecordCount(snap.size),
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'patient_records');
        } catch {
          // Handled
        }
      }
    );
    return () => unsub();
  }, [currentUser]);

  // Generate a clinical lab report image on canvas for 1-click chat image verification
  const handleAttachSampleReportImage = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 760;
    canvas.height = 440;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#0F766E';
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 19px sans-serif';
    ctx.fillText('CLINICAL DIAGNOSTIC REPORT — MULTIMODAL VERIFICATION SPECIMEN', 32, 52);

    ctx.fillStyle = '#475569';
    ctx.font = '13px monospace';
    ctx.fillText('Record ID: #CLN-104 · Specimen: Fasting Venous Blood · Date: 2026-10-22', 32, 80);

    const rows = [
      ['TEST PARAMETER', 'RESULT', 'UNIT', 'REFERENCE RANGE'],
      ['Hemoglobin (Hb)', '11.2', 'g/dL', '12.0 - 15.5'],
      ['Fasting Plasma Glucose', '134', 'mg/dL', '70 - 99'],
      ['HbA1c (Glycated Hb)', '7.1', '%', '4.0 - 5.6'],
      ['LDL Cholesterol', '148', 'mg/dL', '0 - 100'],
      ['HDL Cholesterol', '44', 'mg/dL', '40 - 60'],
      ['Triglycerides', '192', 'mg/dL', '0 - 150'],
      ['Serum Creatinine', '0.9', 'mg/dL', '0.6 - 1.1'],
    ];

    rows.forEach((r, idx) => {
      const y = 120 + idx * 34;
      ctx.font = idx === 0 ? 'bold 13px monospace' : '13px monospace';
      ctx.fillStyle = idx === 0 ? '#0F766E' : '#0F172A';
      ctx.fillText(r[0], 32, y);
      ctx.fillText(r[1], 300, y);
      ctx.fillText(r[2], 440, y);
      ctx.fillText(r[3], 540, y);
    });

    const dataUrl = canvas.toDataURL('image/png');
    setAttachedImageBase64(dataUrl);
    setAttachedImageMime('image/png');
    setAttachedImageName('clinical_diagnostic_blood_panel_cln104.png');
    if (!queryText.trim()) {
      setQueryText(
        'Please verify this diagnostic report image in real time, extract all test values and reference ranges, highlight abnormal markers, and explain what they mean.'
      );
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAttachedImageBase64(reader.result);
        setAttachedImageMime(file.type || 'image/png');
        setAttachedImageName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAsk = async (questionToAsk?: string) => {
    const activeQuestion = (questionToAsk ?? queryText).trim();
    if ((!activeQuestion && !attachedImageBase64) || loading) return;

    setError(null);
    setLoading(true);

    const currentImage = attachedImageBase64;
    const currentMime = attachedImageMime;
    const currentImageName = attachedImageName;

    const userTurn: ConversationTurn = {
      id: `user_${Date.now()}`,
      role: 'user',
      text: activeQuestion || 'Verify attached medical image',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      imagePreview: currentImage || undefined,
      imageName: currentImageName || undefined,
    };

    const updatedTurns = [...turns, userTurn];
    setTurns(updatedTurns);
    if (!questionToAsk) {
      setQueryText('');
      setAttachedImageBase64('');
      setAttachedImageName('');
    }

    try {
      const historyPayload = updatedTurns
        .filter((t) => t.id !== 'welcome_turn')
        .slice(-6)
        .map((t) => ({
          role: t.role,
          text: t.text,
        }));

      const attachedRecordsContext = connectMedicalRecordsDb
        ? `Clinical Patient Record #CLN-104:\n${SYNTHETIC_LAB_REPORTS[0].rawText}\n\nRecent Clinical Encounter Note:\n${SYNTHETIC_CLINICAL_NOTES[0].noteText}`
        : '';

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: activeQuestion,
          language,
          conversationHistory: historyPayload,
          useSearchGrounding,
          imageBase64: currentImage,
          imageMimeType: currentMime,
          attachedRecordsContext,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Unable to retrieve response from HealthBridge AI.');
      }

      const priorCitations =
        updatedTurns
          .slice()
          .reverse()
          .find((t) => t.role === 'assistant' && t.citations && t.citations.length > 0)
          ?.citations || [];

      const mergedCitations: GroundedSourceCitation[] =
        data.citations && data.citations.length > 0 ? data.citations : priorCitations;

      if (data.realtimeDataset) {
        setLiveDataset(data.realtimeDataset);
        setDatasetQuery(data.realtimeDataset.queryTerm || activeQuestion);
      }

      const assistantTurn: ConversationTurn = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        text: data.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        latencyMs: data.latencyMs,
        citations: mergedCitations,
        realtimeDataset: data.realtimeDataset,
        searchQueries: data.searchQueries || [],
        searchPerformed: data.searchPerformed,
        groundingEngine: data.groundingEngine,
        isEmergency: data.isEmergency,
        emergencyCheck: data.emergencyCheck,
        followUpSuggestions: data.followUpSuggestions || [],
        uncertaintyNotice: data.uncertaintyNotice,
      };

      setTurns((prev) => [...prev, assistantTurn]);
      if (mergedCitations.length > 0 && !selectedSource) {
        setSelectedSource(mergedCitations[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Service communication error.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTurnToEncryptedDb = async (turnText: string) => {
    if (!currentUser || !currentUser.emailVerified) {
      setSaveVaultMsg('Please click "Sign In with Google" in the top bar to save encrypted records to Firestore.');
      return;
    }
    const recordId = `rec-${Date.now()}`;
    try {
      const encrypted = await encryptPatientPayload(
        JSON.stringify({ analysis: turnText, savedAt: new Date().toISOString() }),
        `default-vault-key-${currentUser.uid.slice(0, 8)}`,
        currentUser.uid
      );
      await setDoc(doc(db, 'patient_records', recordId), {
        ownerId: currentUser.uid,
        recordTitle: `Clinical Analysis (${new Date().toLocaleTimeString()})`,
        recordCategory: 'imaging_verification',
        cipherText: encrypted.cipherText,
        iv: encrypted.iv,
        algorithm: 'AES-256-GCM',
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSaveVaultMsg(`Encrypted with AES-256-GCM and saved to Firestore (/patient_records/${recordId}).`);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, `patient_records/${recordId}`);
      } catch (e) {
        setSaveVaultMsg(e instanceof Error ? e.message : 'Failed to save encrypted record.');
      }
    }
  };

  const allSessionCitations = Array.from(
    new Map(
      turns
        .flatMap((t) => t.citations || [])
        .map((c) => [c.uri, c])
    ).values()
  );

  return (
    <div className="space-y-6">
      {/* Header Bar with Real-Time Capabilities & Medical Record DB Toggle */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="text-xs font-medium text-teal-700 mb-1">
              01. HealthGuide · Live Clinical Chatbot · Real-Time NIH &amp; PubMed Datasets · Multimodal Image Verifier
            </div>
            <h2 className="text-2xl font-bold text-slate-900">
              Real-Time Healthcare Intelligence &amp; Clinical Dataset Search
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              Ask any health question in English or Telugu (తెలుగు), query live NIH NLM ICD-10-CM conditions, RxNorm medications, and PubMed peer-reviewed literature in real time, or verify diagnostic report images.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useSearchGrounding}
                onChange={(e) => setUseSearchGrounding(e.target.checked)}
                className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              <span>Live Dataset &amp; Citation Grounding</span>
            </label>

            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={connectMedicalRecordsDb}
                onChange={(e) => setConnectMedicalRecordsDb(e.target.checked)}
                className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              <Database className="w-3.5 h-3.5 text-teal-700" />
              <span>Medical Record DB Context ({userRecordCount} Vault + EHR #CLN-104)</span>
            </label>

            {turns.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setTurns(turns.slice(0, 1));
                  setSelectedSource(null);
                  setError(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Chat</span>
              </button>
            )}
          </div>
        </div>

        <div className="pt-3 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-teal-700" />
            <span>
              <strong>Connected Real-Time Datasets:</strong> NIH NLM ICD-10-CM Clinical Conditions · NIH RxNorm / RxTerms Drug Formulary · EuropePMC / PubMed Live Literature
            </span>
          </div>
          <span className="font-mono text-slate-700">Emergency Helpline: 108 / 112 (India)</span>
        </div>
      </div>

      {saveVaultMsg && (
        <div className="p-3 bg-slate-900 text-teal-300 rounded-xl text-xs font-mono flex items-center justify-between">
          <span>{saveVaultMsg}</span>
          <button type="button" onClick={() => setSaveVaultMsg(null)} className="text-white">
            Dismiss
          </button>
        </div>
      )}

      {/* Main 2-Column Layout: Live Chatbot Window (Left 7 cols) + Real-Time Dataset & Citation Explorer (Right 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-4">
          {/* Chat Conversation Stream */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 max-h-[600px] overflow-y-auto">
            {turns.map((turn) => (
              <div
                key={turn.id}
                className={`rounded-xl border p-5 ${
                  turn.role === 'user'
                    ? 'bg-slate-900 text-white border-slate-900 ml-4 sm:ml-10'
                    : turn.isEmergency
                    ? 'bg-red-50 border-red-300 text-slate-900'
                    : 'bg-slate-50/70 border-slate-200 text-slate-900 mr-2 sm:mr-4'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs mb-2 opacity-80">
                  <span className="font-semibold">
                    {turn.role === 'user'
                      ? language === 'te'
                        ? 'మీరు (You)'
                        : 'You'
                      : turn.isEmergency
                      ? 'EMERGENCY TRIAGE INTERCEPT'
                      : 'HealthBridge AI Clinical Assistant'}
                  </span>
                  <div className="flex items-center gap-2 font-mono tabular-nums">
                    {turn.latencyMs && (
                      <span className="text-teal-700 font-semibold">{turn.latencyMs}ms</span>
                    )}
                    <span>{turn.timestamp}</span>
                  </div>
                </div>

                {turn.imagePreview && (
                  <div className="mb-3">
                    <div className="text-xs font-mono text-teal-300 mb-1">
                      Attached Diagnostic Image: {turn.imageName}
                    </div>
                    <img
                      src={turn.imagePreview}
                      alt="Attached diagnostic report for real-time verification"
                      referrerPolicy="no-referrer"
                      className="max-h-48 rounded-lg border border-slate-700 bg-white object-contain"
                    />
                  </div>
                )}

                {turn.isEmergency && turn.emergencyCheck && (
                  <div className="mb-4 p-4 bg-white border border-red-300 rounded-lg space-y-2">
                    <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
                      <PhoneCall className="w-4 h-4 shrink-0" />
                      <span>Immediate Emergency Medical Care Required</span>
                    </div>
                    <div className="text-xs text-slate-700">
                      Triggered Indicators: {turn.emergencyCheck.matchedTriggers.join(' · ')}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs font-mono">
                      <div className="p-2 bg-red-50 rounded border border-red-200 text-red-900">
                        {turn.emergencyCheck.emergencyContacts.indiaAmbulance}
                      </div>
                      <div className="p-2 bg-red-50 rounded border border-red-200 text-red-900">
                        {turn.emergencyCheck.emergencyContacts.indiaNationalEmergency}
                      </div>
                    </div>
                  </div>
                )}

                {turn.role === 'assistant' ? (
                  <AssistantTurnText
                    text={turn.text}
                    citations={turn.citations}
                    onSelectCitation={setSelectedSource}
                  />
                ) : (
                  <div className="text-sm whitespace-pre-line leading-relaxed">{turn.text}</div>
                )}

                {/* Inline Real-Time Dataset Snapshot inside Assistant Turn */}
                {turn.realtimeDataset &&
                  (turn.realtimeDataset.icd10Conditions.length > 0 ||
                    turn.realtimeDataset.rxNormMedications.length > 0) && (
                    <div className="mt-3 p-3 bg-white border border-slate-200 rounded-lg space-y-2 text-xs">
                      <div className="flex items-center justify-between font-mono text-teal-700 font-semibold">
                        <span>
                          LIVE NIH DATASET MATCH ({turn.realtimeDataset.queryTerm.toUpperCase()})
                        </span>
                        <span>
                          PubMed Hits: {turn.realtimeDataset.pubmedTotalHits.toLocaleString()}
                        </span>
                      </div>
                      {turn.realtimeDataset.icd10Conditions.length > 0 && (
                        <div className="text-slate-700">
                          <strong>ICD-10-CM:</strong>{' '}
                          {turn.realtimeDataset.icd10Conditions
                            .slice(0, 4)
                            .map((c) => `${c.code} (${c.name})`)
                            .join(' · ')}
                        </div>
                      )}
                      {turn.realtimeDataset.rxNormMedications.length > 0 && (
                        <div className="text-slate-700">
                          <strong>RxNorm Formulary:</strong>{' '}
                          {turn.realtimeDataset.rxNormMedications
                            .slice(0, 3)
                            .map((m) => m.name)
                            .join(' · ')}
                        </div>
                      )}
                    </div>
                  )}

                {turn.role === 'assistant' && (
                  <div className="mt-4 pt-3 border-t border-slate-200/80 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span>{turn.uncertaintyNotice}</span>
                      <div className="flex items-center gap-3">
                        {turn.id !== 'welcome_turn' && (
                          <button
                            type="button"
                            onClick={() => handleSaveTurnToEncryptedDb(turn.text)}
                            className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-slate-900 whitespace-nowrap"
                          >
                            <Lock className="w-3 h-3 text-teal-700" />
                            <span>Encrypt &amp; Save to Patient DB</span>
                          </button>
                        )}
                        {onSendToHealthAccess && turn.id !== 'welcome_turn' && (
                          <button
                            type="button"
                            onClick={() => onSendToHealthAccess(turn.text)}
                            className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:text-teal-800 whitespace-nowrap"
                          >
                            <span>Translate / Simplify</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {turn.citations && turn.citations.length > 0 && (
                      <div className="space-y-2.5 pt-3 border-t border-slate-200/70">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                            <ExternalLink className="w-3.5 h-3.5 text-teal-700" />
                            Grounded Biomedical &amp; Public Health Citations ({turn.citations.length}):
                          </span>
                          <span className="text-[11px] font-mono text-teal-700 font-medium flex items-center gap-1">
                            <Globe className="w-3 h-3 text-teal-600" />
                            Click to visit external source in new tab ↗
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {turn.citations.map((cit, idx) => {
                            const sourceUrl = getSafeCitationUrl(cit.uri, cit.title);
                            let hostname = 'External Source';
                            try {
                              hostname = new URL(sourceUrl).hostname.replace(/^www\./, '');
                            } catch {
                              hostname = cit.organization || 'External Source';
                            }
                            const isCopied = copiedUrl === sourceUrl;

                            return (
                              <div
                                key={cit.id || cit.uri || idx}
                                className="group relative p-3 rounded-lg border border-slate-200 hover:border-teal-500 bg-white hover:bg-teal-50/25 transition-all flex flex-col justify-between shadow-2xs hover:shadow-xs"
                              >
                                <div>
                                  <div className="flex items-start justify-between gap-1.5 mb-1.5">
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200 truncate max-w-[170px]">
                                      [{idx + 1}] {hostname}
                                    </span>
                                    <span className="text-[10px] font-mono text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200 shrink-0">
                                      {cit.authorityTier.replace(/_/g, ' ')}
                                    </span>
                                  </div>
                                  <a
                                    href={sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setSelectedSource(cit)}
                                    className="text-xs font-semibold text-slate-900 group-hover:text-teal-900 line-clamp-2 hover:underline block"
                                    aria-label={`Open external biomedical citation [${idx + 1}]: ${cit.title} on ${hostname}`}
                                    title={`Open external source: ${sourceUrl}`}
                                  >
                                    {cit.title}
                                  </a>
                                  <div className="text-[11px] text-slate-500 truncate mt-1">
                                    {cit.organization}
                                  </div>
                                </div>

                                <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={(e) => handleCopyCitationUrl(sourceUrl, e)}
                                      className="inline-flex items-center gap-1 font-mono text-slate-500 hover:text-slate-800 transition-colors p-0.5"
                                      title="Copy direct source URL to clipboard"
                                      aria-label="Copy source URL"
                                    >
                                      {isCopied ? (
                                        <>
                                          <Check className="w-3 h-3 text-emerald-600" />
                                          <span className="text-emerald-700 font-semibold">Copied!</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3 h-3 text-slate-400 group-hover:text-slate-600" />
                                          <span>Copy</span>
                                        </>
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setSelectedSource(cit);
                                      }}
                                      className="text-slate-500 hover:text-teal-700 transition-colors underline-offset-2 hover:underline"
                                      title="Inspect source metadata in right drawer"
                                    >
                                      Inspect
                                    </button>
                                  </div>

                                  <a
                                    href={sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setSelectedSource(cit)}
                                    className="inline-flex items-center gap-1 font-mono font-semibold text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2 py-0.5 rounded transition-colors"
                                    title={`Open ${sourceUrl} in new tab`}
                                  >
                                    <span>Visit</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {turn.followUpSuggestions && turn.followUpSuggestions.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-xs font-semibold text-slate-700">
                          Suggested Follow-Up Questions:
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {turn.followUpSuggestions.map((followUp, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => handleAsk(followUp)}
                              disabled={loading}
                              className="text-left text-xs text-teal-800 bg-teal-50/80 hover:bg-teal-100 border border-teal-200 rounded-lg px-3 py-1.5 transition-colors"
                            >
                              {followUp}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 animate-pulse">
                <div className="text-xs font-mono text-teal-700">
                  Querying NIH NLM Clinical Datasets, PubMed &amp; Gemini Flash Engine...
                </div>
                <div className="h-3 bg-slate-200 rounded w-full" />
                <div className="h-3 bg-slate-200 rounded w-4/5" />
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-900 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold">Service Notice</div>
                <p className="text-xs text-red-800">{error}</p>
              </div>
            </div>
          )}

          {/* Multimodal Chat Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk();
            }}
            className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
          >
            {attachedImageBase64 && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src={attachedImageBase64}
                    alt="Attached medical scan preview"
                    referrerPolicy="no-referrer"
                    className="w-16 h-12 object-cover rounded border border-slate-300 bg-white"
                  />
                  <div className="text-xs">
                    <div className="font-semibold text-slate-900">
                      Ready for Real-Time Image Verification
                    </div>
                    <div className="font-mono text-slate-500">{attachedImageName}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAttachedImageBase64('');
                    setAttachedImageName('');
                  }}
                  className="p-1 text-slate-500 hover:text-red-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder={
                  language === 'te'
                    ? 'ఆరోగ్య ప్రశ్న అడగండి లేదా మెడికల్ రిపోర్ట్ చిత్రాన్ని అప్‌లోడ్ చేయండి...'
                    : 'Ask any health question, query connected medical records, or attach an image...'
                }
                className="flex-1 px-4 py-3 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <button
                type="submit"
                disabled={loading || (!queryText.trim() && !attachedImageBase64)}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>{loading ? 'Processing...' : 'Ask HealthBridge'}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-teal-700" />
                  <span>Upload Medical Image / Report</span>
                </button>

                <button
                  type="button"
                  onClick={handleAttachSampleReportImage}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors"
                >
                  <FileImage className="w-3.5 h-3.5" />
                  <span>Attach Sample Lab Report Image (#CLN-104)</span>
                </button>
              </div>

              <div className="text-xs text-slate-500">
                Supports PNG, JPEG, WEBP &amp; Live EHR Context
              </div>
            </div>

            {/* Quick Prompts Grid */}
            <div className="pt-2 border-t border-slate-100">
              <div className="text-xs font-medium text-slate-500 mb-2">
                Instant Clinical &amp; Public Health Queries:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SAMPLE_QUESTIONS.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      const text = language === 'te' ? item.te : item.en;
                      setQueryText(text);
                      handleAsk(text);
                    }}
                    className="text-left p-2.5 rounded-lg border border-slate-200 hover:border-teal-600 hover:bg-slate-50 transition-colors"
                  >
                    <div className="text-xs font-semibold text-teal-700">{item.tag}</div>
                    <div className="text-xs text-slate-700 truncate mt-0.5">
                      {language === 'te' ? item.te : item.en}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </form>
        </div>

        {/* Right 5 Cols: Real-Time Clinical Dataset Search & Grounded Citation Inspector */}
        <div className="lg:col-span-5 space-y-6">
          {/* Live Real-Time Clinical Dataset Explorer (NIH NLM ICD-10-CM + RxNorm + PubMed) */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs font-mono text-teal-700 font-semibold">
                  LIVE REAL-TIME CLINICAL DATASETS (NIH NLM &amp; PUBMED)
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  Real-Time ICD-10-CM, RxNorm &amp; Literature Search
                </h3>
              </div>
              {liveDataset && (
                <span className="text-xs font-mono text-teal-700 bg-teal-50 border border-teal-200 px-2 py-1 rounded">
                  {liveDataset.latencyMs}ms
                </span>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchLiveClinicalDataset(datasetQuery);
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={datasetQuery}
                  onChange={(e) => setDatasetQuery(e.target.value)}
                  placeholder="Search live NIH ICD-10, RxNorm, PubMed (e.g., dengue, metformin, asthma)..."
                  className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <button
                type="submit"
                disabled={datasetLoading}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
              >
                {datasetLoading ? 'Fetching...' : 'Live Search'}
              </button>
            </form>

            {/* Quick Dataset Topic Switchers */}
            <div className="flex flex-wrap gap-1.5">
              {['diabetes', 'dengue', 'hypertension', 'metformin', 'anemia', 'hypothyroidism'].map(
                (term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => {
                      setDatasetQuery(term);
                      fetchLiveClinicalDataset(term);
                    }}
                    className="px-2.5 py-1 text-xs font-mono bg-slate-100 hover:bg-teal-50 hover:text-teal-800 text-slate-700 rounded transition-colors"
                  >
                    {term}
                  </button>
                )
              )}
            </div>

            {liveDataset && (
              <div className="space-y-3 pt-1">
                {/* ICD-10-CM Live Matches */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                    <span className="flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-teal-700" />
                      <span>NIH NLM ICD-10-CM Diagnostic Codes</span>
                    </span>
                    <span className="font-mono text-slate-500">
                      {liveDataset.icd10Conditions.length} matches
                    </span>
                  </div>
                  {liveDataset.icd10Conditions.length === 0 ? (
                    <div className="text-xs text-slate-500">
                      No direct ICD-10-CM code matches for &ldquo;{liveDataset.queryTerm}&rdquo;.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-1 max-h-36 overflow-y-auto">
                      {liveDataset.icd10Conditions.map((item, idx) => (
                        <div
                          key={idx}
                          className="text-xs flex items-center justify-between bg-white px-2.5 py-1.5 rounded border border-slate-200"
                        >
                          <span className="text-slate-800 font-medium truncate pr-2">
                            {item.name}
                          </span>
                          <span className="font-mono font-bold text-teal-700 shrink-0">
                            {item.code}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* NIH RxNorm / RxTerms Live Medications */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                    <span className="flex items-center gap-1.5">
                      <Pill className="w-3.5 h-3.5 text-teal-700" />
                      <span>NIH RxNorm / RxTerms Formulary</span>
                    </span>
                    <span className="font-mono text-slate-500">
                      {liveDataset.rxNormMedications.length} records
                    </span>
                  </div>
                  {liveDataset.rxNormMedications.length === 0 ? (
                    <div className="text-xs text-slate-500">
                      Search a medication or active ingredient (e.g., metformin, amlodipine, paracetamol) to inspect live strengths.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {liveDataset.rxNormMedications.map((med, idx) => (
                        <div
                          key={idx}
                          className="text-xs bg-white px-2.5 py-1.5 rounded border border-slate-200"
                        >
                          <div className="font-semibold text-slate-900">{med.name}</div>
                          {med.strengths.length > 0 && (
                            <div className="font-mono text-slate-500 text-[11px] truncate">
                              Strengths: {med.strengths.join(', ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Live PubMed / EuropePMC Literature */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                    <span className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-teal-700" />
                      <span>PubMed / EuropePMC Peer-Reviewed Index</span>
                    </span>
                    <span className="font-mono text-teal-700">
                      {liveDataset.pubmedTotalHits.toLocaleString()} total papers
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {liveDataset.pubmedArticles.map((art, idx) => (
                      <a
                        key={idx}
                        href={art.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs bg-white p-2 rounded border border-slate-200 hover:border-teal-600 transition-colors"
                      >
                        <div className="font-semibold text-slate-900 line-clamp-1">
                          {art.title}
                        </div>
                        <div className="text-slate-500 font-mono text-[11px] flex items-center justify-between mt-0.5">
                          <span>
                            {art.journal} ({art.pubYear})
                          </span>
                          <span className="text-teal-700">PMID: {art.pmid}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Grounded Source Citations Inspector */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <div className="text-xs font-medium text-teal-700">Live Citation Verification</div>
              <h3 className="text-base font-bold text-slate-900 mt-0.5">
                Grounded Sources &amp; Authority Inspector
              </h3>
            </div>

            {allSessionCitations.length === 0 ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 space-y-1">
                <div className="font-semibold text-slate-700">Ready for Source Verification</div>
                <p>
                  Ask any question on the left to inspect verified PubMed, NIH NLM, WHO, and MoHFW citations with direct links.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedSource && (() => {
                  const sourceUrl = getSafeCitationUrl(selectedSource.uri, selectedSource.title);
                  const isCopied = copiedUrl === sourceUrl;
                  return (
                    <div className="p-3.5 bg-slate-50 border border-teal-300 rounded-lg space-y-2.5 text-xs shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-teal-800 font-bold bg-teal-100/70 border border-teal-200 px-2 py-0.5 rounded text-[10px]">
                          {selectedSource.authorityTier.replace(/_/g, ' ')}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedSource(null)}
                          className="text-slate-400 hover:text-slate-700 text-xs font-semibold"
                          title="Close citation detail"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="font-bold text-slate-900 leading-snug">{selectedSource.title}</div>
                      <div className="text-slate-600 flex items-center justify-between text-[11px]">
                        <span>{selectedSource.organization}</span>
                        <span className="text-slate-500 font-mono">{selectedSource.publicationDate}</span>
                      </div>

                      <div className="p-2 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-700 break-all select-all flex items-center justify-between gap-2">
                        <span className="truncate">{sourceUrl}</span>
                        <button
                          type="button"
                          onClick={(e) => handleCopyCitationUrl(sourceUrl, e)}
                          className="text-teal-700 hover:text-teal-900 shrink-0 font-semibold flex items-center gap-1"
                        >
                          {isCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          <span>{isCopied ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <a
                          href={sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors text-center"
                        >
                          <span>Open Verified Source in New Tab</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  );
                })()}

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {allSessionCitations.map((cit, idx) => {
                    const sourceUrl = getSafeCitationUrl(cit.uri, cit.title);
                    const isCopied = copiedUrl === sourceUrl;
                    const isSelected = selectedSource?.uri === cit.uri;
                    let hostname = 'External Source';
                    try {
                      hostname = new URL(sourceUrl).hostname.replace(/^www\./, '');
                    } catch {
                      hostname = cit.organization || 'External Source';
                    }

                    return (
                      <div
                        key={cit.id || cit.uri || idx}
                        className={`p-2.5 rounded-lg border text-xs transition-colors group ${
                          isSelected
                            ? 'border-teal-700 bg-teal-50/50 shadow-xs'
                            : 'border-slate-200 hover:border-teal-500 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5 mb-1">
                          <span className="font-mono text-[10px] text-teal-800 font-bold bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                            [{idx + 1}] {hostname}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => handleCopyCitationUrl(sourceUrl, e)}
                              className="text-slate-400 hover:text-slate-700 p-0.5"
                              title="Copy URL"
                            >
                              {isCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedSource(cit)}
                              className="text-slate-500 hover:text-teal-700 text-[11px] font-medium"
                            >
                              Inspect
                            </button>
                          </div>
                        </div>

                        <a
                          href={sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setSelectedSource(cit)}
                          className="font-semibold text-slate-900 group-hover:text-teal-900 line-clamp-1 block hover:underline"
                          title={`Open ${sourceUrl}`}
                        >
                          {cit.title}
                        </a>

                        <div className="text-slate-500 truncate mt-1 flex items-center justify-between text-[11px]">
                          <span className="truncate">{cit.organization}</span>
                          <a
                            href={sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setSelectedSource(cit)}
                            className="text-teal-700 font-mono font-bold ml-1 shrink-0 flex items-center gap-0.5 hover:underline"
                          >
                            <span>Open</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Connected Medical Record Database Preview */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs font-mono text-teal-700">DIRECT DATABASE INTEGRATION</div>
                <h3 className="text-sm font-bold text-slate-900">
                  Active Medical Record Context (#CLN-104)
                </h3>
              </div>
              <Database className="w-4 h-4 text-teal-700" />
            </div>
            <p className="text-xs text-slate-600">
              When <strong>Medical Record DB Context</strong> is enabled, the assistant cross-references your active clinical laboratory panel (#CLN-104) in real time:
            </p>
            <pre className="p-3 bg-slate-900 text-teal-300 rounded-lg font-mono text-xs overflow-x-auto max-h-40">
              {SYNTHETIC_LAB_REPORTS[0].rawText}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export const HealthGuideModule = React.memo(HealthGuideModuleComponent);

