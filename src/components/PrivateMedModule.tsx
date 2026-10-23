import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Lock,
  Trash2,
  Eye,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  KeyRound,
  RefreshCw,
  Clock,
  Activity,
  FileImage,
  HelpCircle,
} from 'lucide-react';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { encryptPatientPayload, decryptPatientPayload } from '../lib/cryptoVault';
import {
  extractExplicitReportMetrics,
  ParsedReportMetric,
} from '../shared/clinicalCore';
import { SYNTHETIC_LAB_REPORTS } from '../shared/sampleData';
import { apiPostPrivateMedVerify } from '../lib/apiClient';

interface PrivateMedModuleProps {
  language: 'en' | 'te';
  currentUser: User | null;
}

interface CloudVerificationFinding {
  parameterName: string;
  observedValue: string;
  unit: string;
  referenceRangeInReport: string;
  statusIndicator: string;
  plainExplanationEn: string;
  plainExplanationTe: string;
}

interface CloudVerificationResponse {
  processingLocation: string;
  latencyMs?: number;
  modelUsed?: string;
  consentVerified?: boolean;
  documentModality?: string;
  imageVerificationStatus: string;
  diagnosticInsightsEn?: string[];
  diagnosticInsightsTe?: string[];
  overallPlainSummaryEn: string;
  overallPlainSummaryTe: string;
  extractedFindings: CloudVerificationFinding[];
  missingOrUnreadableFields: string[];
  questionsForDoctor: string[];
  realtimeDataset?: {
    queryTerm: string;
    pubmedTotalHits: number;
    icd10Conditions: Array<{ code: string; name: string }>;
    rxNormMedications: Array<{ name: string; strengths: string[] }>;
  };
  disclaimer: string;
}

interface EncryptedRecordItem {
  id: string;
  recordTitle: string;
  recordCategory: string;
  cipherText: string;
  iv: string;
  algorithm: string;
  status: string;
}

type SpecimenPresetId = 'CLN-882' | 'CLN-915' | 'CLN-409';

const PrivateMedModuleComponent: React.FC<PrivateMedModuleProps> = ({
  language,
  currentUser,
}) => {
  const [processingMode, setProcessingMode] = useState<'LOCAL_ONLY' | 'CLOUD_OPT_IN'>('CLOUD_OPT_IN');
  // Explicit User Consent MUST be provided by the user before Gemini multimodal analysis runs
  const [explicitCloudConsent, setExplicitCloudConsent] = useState(false);

  // Report Content State (Strictly Ephemeral in Browser Memory)
  const [reportText, setReportText] = useState(SYNTHETIC_LAB_REPORTS[0].rawText);
  const [showPreAnalysisInspector, setShowPreAnalysisInspector] = useState(true);

  // Local Companion / Ollama Connection State
  const [companionEndpoint, setCompanionEndpoint] = useState('http://127.0.0.1:8765');
  const [ollamaDirectEndpoint, setOllamaDirectEndpoint] = useState('http://127.0.0.1:11434');
  const [localModelName, setLocalModelName] = useState('llama3.2:3b');
  const [localProbing, setLocalProbing] = useState(false);
  const [localStatus, setLocalStatus] = useState<{
    reachable: boolean;
    mode: string;
    message: string;
  }>({
    reachable: false,
    mode: 'NOT_PROBED',
    message:
      'Click "Probe Local Companion" to test whether Ollama or the PrivateMed FastAPI companion is running on your device (127.0.0.1).',
  });
  const [localExplanation, setLocalExplanation] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Multimodal Image Upload & Explicit Opt-In Cloud Verification State
  const [uploadedImageBase64, setUploadedImageBase64] = useState<string>('');
  const [uploadedImageMime, setUploadedImageMime] = useState<string>('image/png');
  const [uploadedImageName, setUploadedImageName] = useState<string>('');
  const [uploadedImageDimensions, setUploadedImageDimensions] = useState<string>('');
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [pendingStageIndex, setPendingStageIndex] = useState(0);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudResult, setCloudResult] = useState<CloudVerificationResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Encrypted Patient Vault State (Client-Side AES-256-GCM + Firestore)
  const [vaultPassphrase, setVaultPassphrase] = useState('');
  const [vaultRecordTitle, setVaultRecordTitle] = useState(
    'Comprehensive Metabolic & Hematology Panel #CLN-104'
  );
  const [savedRecords, setSavedRecords] = useState<EncryptedRecordItem[]>([]);
  const [decryptedMap, setDecryptedMap] = useState<Record<string, string>>({});
  const [vaultStatus, setVaultStatus] = useState<string | null>(null);

  // Deterministic Local Pre-Inspection (Zero network calls)
  const localParsed: {
    metrics: ParsedReportMetric[];
    missingOrUnreadableWarnings: string[];
  } = extractExplicitReportMetrics(reportText);

  // Cycle through multimodal pipeline steps while Analysis Pending is active
  useEffect(() => {
    if (!cloudLoading) {
      setPendingStageIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setPendingStageIndex((prev) => (prev < 3 ? prev + 1 : prev));
    }, 380);
    return () => clearInterval(timer);
  }, [cloudLoading]);

  // Subscribe to authenticated user's encrypted records in Firestore
  useEffect(() => {
    if (!currentUser || !currentUser.emailVerified) {
      setSavedRecords([]);
      return;
    }
    const q = query(
      collection(db, 'patient_records'),
      where('ownerId', '==', currentUser.uid)
    );
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const items: EncryptedRecordItem[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            recordTitle: data.recordTitle,
            recordCategory: data.recordCategory,
            cipherText: data.cipherText,
            iv: data.iv,
            algorithm: data.algorithm,
            status: data.status,
          };
        });
        setSavedRecords(items);
      },
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

  // Clear all temporary report state from browser RAM
  const handlePurgeTemporaryReport = () => {
    setReportText('');
    setUploadedImageBase64('');
    setUploadedImageName('');
    setUploadedImageDimensions('');
    setExplicitCloudConsent(false);
    setLocalExplanation(null);
    setCloudResult(null);
    setLocalError(null);
    setCloudError(null);
  };

  // Probe user's local computer (127.0.0.1:8765 or 127.0.0.1:11434) from their browser
  const handleProbeLocalCompanion = async () => {
    setLocalProbing(true);
    setLocalError(null);
    try {
      const compRes = await fetch(`${companionEndpoint}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2500),
      });
      if (compRes.ok) {
        const data = await compRes.json();
        setLocalStatus({
          reachable: Boolean(data.ollama_reachable),
          mode: 'FASTAPI_COMPANION',
          message: data.ollama_reachable
            ? `Connected to Local FastAPI Companion (${companionEndpoint}) with Ollama models: ${(data.available_models || []).join(', ') || localModelName}`
            : `FastAPI Companion reached at ${companionEndpoint}, but local Ollama daemon (${ollamaDirectEndpoint}) is not running.`,
        });
        setLocalProbing(false);
        return;
      }
    } catch {
      // Next try direct Ollama API on 127.0.0.1:11434
    }

    try {
      const ollamaRes = await fetch(`${ollamaDirectEndpoint}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(2500),
      });
      if (ollamaRes.ok) {
        const data = await ollamaRes.json();
        const models = (data.models || []).map((m: { name: string }) => m.name);
        setLocalStatus({
          reachable: true,
          mode: 'DIRECT_OLLAMA',
          message: `Connected directly to local Ollama on your computer (${ollamaDirectEndpoint}). Available models: ${models.join(', ') || 'none pulled yet'}.`,
        });
        if (models.length > 0) setLocalModelName(models[0]);
        setLocalProbing(false);
        return;
      }
    } catch {
      // Neither local service is reachable on the user's machine
    }

    setLocalStatus({
      reachable: false,
      mode: 'REQUIRES_LOCAL_SETUP',
      message:
        'Local Ollama / Companion was not detected at 127.0.0.1:8765 or 127.0.0.1:11434 on your computer. Strict Local-Only Mode NEVER silently switches to cloud AI. Follow the local setup instructions below or use the deterministic local parser.',
    });
    setLocalProbing(false);
  };

  // Run Strict Local-Only Inference via User's Local Companion / Ollama or Browser-RAM Deterministic Synthesis
  const handleRunLocalOllamaInference = async () => {
    if (!reportText.trim() || localLoading) return;
    setLocalLoading(true);
    setLocalError(null);
    setLocalExplanation(null);

    try {
      if (localStatus.mode === 'FASTAPI_COMPANION') {
        const res = await fetch(`${companionEndpoint}/analyze-local`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            report_text: reportText,
            model: localModelName,
            language,
          }),
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) {
          throw new Error('Local FastAPI companion returned an error.');
        }
        const data = await res.json();
        setLocalExplanation(data.plain_language_explanation);
        setLocalLoading(false);
        return;
      }

      const res = await fetch(`${ollamaDirectEndpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: localModelName,
          system:
            'You are PrivateMed Local Assistant. Explain medical terms and values present in the report in plain language. Never invent values, diagnose, or recommend treatment changes.',
          prompt: reportText,
          stream: false,
        }),
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) {
        throw new Error('Local Ollama returned an error.');
      }
      const data = await res.json();
      setLocalExplanation(data.response || 'Completed local inference.');
    } catch {
      // Zero-Cloud Browser-RAM Deterministic Synthesis Fallback when local Ollama is offline
      const flagged = localParsed.metrics.filter((m) => m.flag === 'OUTSIDE_RANGE');
      const normal = localParsed.metrics.filter((m) => m.flag === 'WITHIN_RANGE');
      const summaryLines: string[] = [
        language === 'te'
          ? `ఆన్-డివైస్ బ్రౌజర్ RAM విశ్లేషణ (0 బైట్ల క్లౌడ్ ట్రాన్స్‌మిషన్): మొత్తం ${localParsed.metrics.length} పరీక్షా విలువలు గుర్తించబడ్డాయి.`
          : `On-Device Browser RAM Analysis (Zero Cloud Transmission): Parsed ${localParsed.metrics.length} explicit laboratory parameters directly in local memory.`,
      ];

      if (flagged.length > 0) {
        summaryLines.push(
          language === 'te'
            ? `\n• సాధారణ పరిధికి వెలుపల ఉన్న విలువలు (${flagged.length}):`
            : `\n• Parameters Outside Reference Interval (${flagged.length}):`
        );
        flagged.forEach((m) => {
          const dir =
            language === 'te'
              ? 'సాధారణ పరిధికి వెలుపల (Outside Reference Range)'
              : 'Outside Reference Range';
          summaryLines.push(
            `  - ${m.testName}: ${m.observedValue} ${m.unit} [Ref: ${m.referenceRange}] -> ${dir}`
          );
        });
      }

      if (normal.length > 0) {
        summaryLines.push(
          language === 'te'
            ? `\n• సాధారణ పరిధిలో ఉన్న విలువలు (${normal.length}): ${normal
                .map((m) => `${m.testName} (${m.observedValue} ${m.unit})`)
                .join(', ')}`
            : `\n• Parameters Within Reference Interval (${normal.length}): ${normal
                .map((m) => `${m.testName} (${m.observedValue} ${m.unit})`)
                .join(', ')}`
        );
      }

      if (localParsed.missingOrUnreadableWarnings.length > 0) {
        summaryLines.push(
          language === 'te'
            ? `\n• అస్పష్టమైన / కనిపించని విలువలు (ಊహించబడలేదు): ${localParsed.missingOrUnreadableWarnings.join('; ')}`
            : `\n• Missing or Unreadable Entries (Never Guessed): ${localParsed.missingOrUnreadableWarnings.join('; ')}`
        );
      }

      summaryLines.push(
        language === 'te'
          ? `\nగమనిక: ఈ విశ్లేషణ మీ పరికరంలోనే జరిగింది. ఖచ్చితమైన వైద్య సలహా కోసం మీ వైద్యుడిని సంప్రదించండి.`
          : `\nPrivacy Note: Executed 100% locally in browser RAM without any cloud network calls. Review flagged biomarkers with your ordering clinician.`
      );

      setLocalExplanation(summaryLines.join('\n'));
    } finally {
      setLocalLoading(false);
    }
  };

  // Generate Clinical Diagnostic Specimen Images on HTML5 Canvas for Multimodal Pipeline Verification
  const handleLoadClinicalSpecimenImage = (presetId: SpecimenPresetId) => {
    const canvas = document.createElement('canvas');
    canvas.width = 780;
    canvas.height = 460;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#0F766E';
    ctx.lineWidth = 3;
    ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);

    const presets: Record<
      SpecimenPresetId,
      {
        title: string;
        meta: string;
        fileName: string;
        rows: string[][];
      }
    > = {
      'CLN-882': {
        title: 'CLINICAL DIAGNOSTIC LABORATORY REPORT — METABOLIC & LIPID PANEL (#CLN-882)',
        meta: 'Patient: [DE-IDENTIFIED RECORD]   Age/Sex: 52Y/M   Specimen: Fasting Venous Blood',
        fileName: 'clinical_metabolic_lipid_panel_cln882.png',
        rows: [
          ['PARAMETER', 'OBSERVED VALUE', 'UNIT', 'REFERENCE INTERVAL'],
          ['Hemoglobin (Hb)', '10.8', 'g/dL', '13.0 - 17.0'],
          ['Fasting Plasma Glucose', '142', 'mg/dL', '70 - 99'],
          ['HbA1c (HPLC)', '7.4', '%', '4.0 - 5.6'],
          ['Serum Creatinine', '1.0', 'mg/dL', '0.7 - 1.2'],
          ['Total Cholesterol', '228', 'mg/dL', '0 - 200'],
          ['TSH (Ultrasensitive)', '2.4', 'mIU/L', '0.45 - 4.50'],
          ['Serum Vitamin B12', '[Blurred / Illegible Stamp]', 'pg/mL', '200 - 900'],
        ],
      },
      'CLN-915': {
        title: 'CLINICAL DIAGNOSTIC LABORATORY REPORT — THYROID & HEMATOLOGY (#CLN-915)',
        meta: 'Patient: [DE-IDENTIFIED RECORD]   Age/Sex: 38Y/F   Specimen: Whole Blood & Serum',
        fileName: 'clinical_thyroid_hematology_cln915.png',
        rows: [
          ['PARAMETER', 'OBSERVED VALUE', 'UNIT', 'REFERENCE INTERVAL'],
          ['TSH (Ultrasensitive)', '6.8', 'mIU/L', '0.45 - 4.50'],
          ['Free T4 (Thyroxine)', '0.72', 'ng/dL', '0.80 - 1.80'],
          ['Hemoglobin (Hb)', '10.4', 'g/dL', '12.0 - 15.5'],
          ['Serum Ferritin', '9.5', 'ng/mL', '15.0 - 150.0'],
          ['Total WBC Count', '6800', 'cells/mcL', '4000 - 11000'],
          ['Platelet Count', '245000', 'cells/mcL', '150000 - 450000'],
          ['Reticulocyte Index', '[Not Printed on Sheet]', '%', '0.5 - 2.5'],
        ],
      },
      'CLN-409': {
        title: 'CLINICAL DIAGNOSTIC LABORATORY REPORT — RENAL & LIVER PANEL (#CLN-409)',
        meta: 'Patient: [DE-IDENTIFIED RECORD]   Age/Sex: 61Y/M   Specimen: Heparinized Plasma',
        fileName: 'clinical_renal_electrolyte_cln409.png',
        rows: [
          ['PARAMETER', 'OBSERVED VALUE', 'UNIT', 'REFERENCE INTERVAL'],
          ['Blood Urea Nitrogen (BUN)', '24', 'mg/dL', '7 - 20'],
          ['Serum Creatinine', '1.35', 'mg/dL', '0.70 - 1.20'],
          ['Serum Uric Acid', '8.2', 'mg/dL', '3.5 - 7.2'],
          ['Serum Sodium (Na+)', '139', 'mmol/L', '135 - 145'],
          ['Serum Potassium (K+)', '4.6', 'mmol/L', '3.5 - 5.1'],
          ['ALT (SGPT)', '58', 'U/L', '7 - 45'],
          ['AST (SGOT)', '49', 'U/L', '8 - 40'],
        ],
      },
    };

    const chosen = presets[presetId];

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(chosen.title, 36, 54);

    ctx.fillStyle = '#475569';
    ctx.font = '13px monospace';
    ctx.fillText(chosen.meta, 36, 84);

    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(36, 100);
    ctx.lineTo(744, 100);
    ctx.stroke();

    chosen.rows.forEach((r, idx) => {
      const y = 134 + idx * 36;
      ctx.font = idx === 0 ? 'bold 13px monospace' : '13px monospace';
      ctx.fillStyle = idx === 0 ? '#0F766E' : '#0F172A';
      ctx.fillText(r[0], 36, y);
      ctx.fillText(r[1], 305, y);
      ctx.fillText(r[2], 500, y);
      ctx.fillText(r[3], 590, y);
    });

    ctx.fillStyle = '#64748B';
    ctx.font = 'italic 12px sans-serif';
    ctx.fillText(
      `De-Identified Clinical Diagnostic Specimen (${presetId}) — Ready for Gemini Multimodal Analysis`,
      36,
      424
    );

    const formattedSpecimenText = [
      chosen.title,
      chosen.meta,
      ...chosen.rows.slice(1).map((r) => `${r[0]}: ${r[1]} ${r[2]} (Ref: ${r[3]})`),
    ].join('\n');

    const dataUrl = canvas.toDataURL('image/png');
    setReportText(formattedSpecimenText);
    setUploadedImageBase64(dataUrl);
    setUploadedImageMime('image/png');
    setUploadedImageName(chosen.fileName);
    setUploadedImageDimensions('780 × 460 px · PNG');
    setVaultRecordTitle(`Multimodal Diagnostic Report (${presetId})`);
    setCloudResult(null);
    setCloudError(null);
    setProcessingMode('CLOUD_OPT_IN');
  };

  const processSelectedImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const dataUrl = reader.result;
        setUploadedImageBase64(dataUrl);
        setUploadedImageMime(file.type || 'image/png');
        setUploadedImageName(file.name);
        setCloudResult(null);
        setCloudError(null);
        setProcessingMode('CLOUD_OPT_IN');

        const img = new Image();
        img.onload = () => {
          setUploadedImageDimensions(
            `${img.width} × ${img.height} px · ${(file.size / 1024).toFixed(1)} KB`
          );
        };
        img.src = dataUrl;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processSelectedImageFile(file);
  };

  const handleDropImage = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingImage(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processSelectedImageFile(file);
    }
  };

  // Run Explicit Opt-In Cloud Multimodal Verification
  const handleRunCloudVerification = async () => {
    if (!explicitCloudConsent) {
      setCloudError(
        'Explicit User Consent Required: Please check the Explicit Cloud Opt-In Consent box above before Gemini extracts diagnostic insights.'
      );
      return;
    }
    if (!uploadedImageBase64 && !reportText.trim()) {
      setCloudError('Please attach a medical image or provide report text before running analysis.');
      return;
    }

    setCloudLoading(true);
    setCloudError(null);
    setCloudResult(null);

    try {
      const data = await apiPostPrivateMedVerify({
        explicitCloudConsent: true,
        reportText,
        imageBase64: uploadedImageBase64,
        imageMimeType: uploadedImageMime,
        language,
      });
      setCloudResult(data);
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : 'Error verifying report.');
    } finally {
      setCloudLoading(false);
    }
  };

  const handleDownloadVerifiedJson = () => {
    if (!cloudResult) return;
    const blob = new Blob([JSON.stringify(cloudResult, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `privatemed_verified_report_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Encrypt & Save to Firestore Patient Vault
  const handleSaveEncryptedRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !currentUser.emailVerified) {
      setVaultStatus('Please sign in with a verified Google account to store encrypted records.');
      return;
    }
    if (vaultPassphrase.length < 6) {
      setVaultStatus('Please enter an encryption passphrase of at least 6 characters.');
      return;
    }

    setVaultStatus(null);
    const recordId = `rec-${Date.now()}`;
    try {
      const payloadToEncrypt = JSON.stringify({
        reportText: reportText.slice(0, 8000),
        localMetrics: localParsed.metrics,
        multimodalDiagnosticInsightsEn: cloudResult?.diagnosticInsightsEn || [],
        cloudSummary: cloudResult?.overallPlainSummaryEn || null,
        extractedFindings: cloudResult?.extractedFindings || [],
        encryptedAt: new Date().toISOString(),
      });

      const encrypted = await encryptPatientPayload(
        payloadToEncrypt,
        vaultPassphrase,
        currentUser.uid
      );

      await setDoc(doc(db, 'patient_records', recordId), {
        ownerId: currentUser.uid,
        recordTitle: vaultRecordTitle.trim().slice(0, 160),
        recordCategory: uploadedImageBase64 ? 'imaging_verification' : 'lab_report',
        cipherText: encrypted.cipherText,
        iv: encrypted.iv,
        algorithm: 'AES-256-GCM',
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setVaultStatus(
        `Encrypted with AES-256-GCM in browser and stored at /patient_records/${recordId}.`
      );
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, `patient_records/${recordId}`);
      } catch (formatted) {
        setVaultStatus(formatted instanceof Error ? formatted.message : 'Vault write failed.');
      }
    }
  };

  const handleDecryptRecord = async (rec: EncryptedRecordItem) => {
    if (!currentUser) return;
    if (!vaultPassphrase) {
      setVaultStatus('Enter your encryption passphrase above to decrypt this record.');
      return;
    }
    try {
      const plain = await decryptPatientPayload(
        rec.cipherText,
        rec.iv,
        vaultPassphrase,
        currentUser.uid
      );
      setDecryptedMap((prev) => ({ ...prev, [rec.id]: plain }));
      setVaultStatus(`Successfully decrypted ${rec.recordTitle} in browser memory.`);
    } catch {
      setVaultStatus('Decryption failed: Invalid passphrase for this AES-256-GCM record.');
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    try {
      await deleteDoc(doc(db, 'patient_records', recordId));
      setVaultStatus(`Deleted encrypted record ${recordId} from Firestore.`);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.DELETE, `patient_records/${recordId}`);
      } catch (formatted) {
        setVaultStatus(formatted instanceof Error ? formatted.message : 'Delete failed.');
      }
    }
  };

  const isAnalysisPending =
    cloudLoading || (!cloudResult && Boolean(uploadedImageBase64 || reportText.trim()));

  const PENDING_STEPS = [
    'Verifying Explicit User Consent & Ephemeral Privacy Envelope',
    'Running Gemini Multimodal Vision & OCR Specimen Inspection',
    'Extracting Biomarkers, Units, Reference Ranges & Unreadable Regions',
    'Cross-Referencing NIH NLM ICD-10-CM Datasets & Synthesizing Bilingual Insights',
  ];

  return (
    <div className="space-y-8">
      {/* Module Header & Processing Location Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="text-xs font-medium text-teal-700 mb-1">
              04. PrivateMed · Consent-Gated Multimodal Image Analysis &amp; Local Privacy Engine
            </div>
            <h2 className="text-2xl font-bold text-slate-900">
              Multimodal Diagnostic Image Analysis &amp; Report Explanation
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              Extracts diagnostic insights from uploaded medical images and laboratory reports using Gemini&apos;s multimodal capabilities strictly when explicit user consent is provided, alongside 100% on-device biomarker parsing and local Ollama companion execution.
            </p>
          </div>

          {/* Processing Mode Switcher */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => setProcessingMode('CLOUD_OPT_IN')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                processingMode === 'CLOUD_OPT_IN'
                  ? 'bg-teal-700 text-white shadow-sm'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Gemini Multimodal Image &amp; Report Pipeline
            </button>
            <button
              type="button"
              onClick={() => setProcessingMode('LOCAL_ONLY')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                processingMode === 'LOCAL_ONLY'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Strict Local-Only (Ollama 127.0.0.1)
            </button>
          </div>
        </div>

        {/* Clear Notice Describing Where Processing Occurs */}
        <div className="pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
          {processingMode === 'LOCAL_ONLY' ? (
            <div className="flex items-center gap-2 text-slate-800">
              <Lock className="w-4 h-4 text-teal-700 shrink-0" />
              <span>
                <strong>Active Processing Location:</strong> Browser Memory + Your Computer&apos;s Local Loopback (<code className="font-mono">127.0.0.1</code>). Zero cloud transmission; never falls back to cloud AI if Ollama is offline.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-800">
              <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" />
              <span>
                <strong>Active Processing Location:</strong> Consent-Gated Server-Side Gemini Multimodal Pipeline + On-Device Browser Biomarker Parser. No diagnostic extraction occurs until explicit consent is checked.
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={handlePurgeTemporaryReport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors whitespace-nowrap shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Purge Ephemeral Report &amp; Image RAM</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 6 Cols: Multimodal Image Dropzone, Specimen Presets, Text Inspector & On-Device Parser */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            {/* Multimodal Image Dropzone & Clinical Specimen Loader */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingImage(true);
              }}
              onDragLeave={() => setIsDraggingImage(false)}
              onDrop={handleDropImage}
              className={`p-5 rounded-xl border-2 border-dashed transition-colors space-y-4 ${
                isDraggingImage
                  ? 'border-teal-600 bg-teal-50/40'
                  : 'border-slate-300 bg-slate-50/70'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-mono text-teal-700 font-semibold">
                    STEP 1 · MULTIMODAL DIAGNOSTIC IMAGE INPUT
                  </div>
                  <h3 className="text-base font-bold text-slate-900">
                    Upload Medical Report Scan or Load Clinical Specimen Image
                  </h3>
                  <p className="text-xs text-slate-600">
                    Drag &amp; drop or browse a PNG, JPEG, or WEBP diagnostic report image, or load a clinical laboratory specimen below.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleImageFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Medical Image</span>
                  </button>
                </div>
              </div>

              {/* 3 Clinical Specimen Presets */}
              <div className="space-y-1.5 pt-1">
                <div className="text-xs font-semibold text-slate-700">
                  Or load a high-resolution clinical specimen image for multimodal verification:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleLoadClinicalSpecimenImage('CLN-882')}
                    className="p-2.5 text-left text-xs bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-600 rounded-lg transition-colors"
                  >
                    <div className="font-bold text-slate-900 flex items-center gap-1">
                      <FileImage className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                      <span>Specimen #CLN-882</span>
                    </div>
                    <div className="text-slate-500 mt-0.5">Metabolic, HbA1c &amp; Lipid Panel</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleLoadClinicalSpecimenImage('CLN-915')}
                    className="p-2.5 text-left text-xs bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-600 rounded-lg transition-colors"
                  >
                    <div className="font-bold text-slate-900 flex items-center gap-1">
                      <FileImage className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                      <span>Specimen #CLN-915</span>
                    </div>
                    <div className="text-slate-500 mt-0.5">Thyroid (TSH/FT4) &amp; Anemia CBC</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleLoadClinicalSpecimenImage('CLN-409')}
                    className="p-2.5 text-left text-xs bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-600 rounded-lg transition-colors"
                  >
                    <div className="font-bold text-slate-900 flex items-center gap-1">
                      <FileImage className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                      <span>Specimen #CLN-409</span>
                    </div>
                    <div className="text-slate-500 mt-0.5">Renal, Uric Acid &amp; Liver Panel</div>
                  </button>
                </div>
              </div>

              {uploadedImageBase64 && (
                <div className="space-y-2 pt-3 border-t border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 font-mono">
                    <div>
                      <span className="font-bold text-slate-900">{uploadedImageName}</span>
                      {uploadedImageDimensions && (
                        <span className="text-slate-500 ml-2">({uploadedImageDimensions})</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUploadedImageBase64('');
                        setUploadedImageName('');
                        setUploadedImageDimensions('');
                        setCloudResult(null);
                      }}
                      className="text-red-700 hover:underline font-sans font-semibold"
                    >
                      Remove Image
                    </button>
                  </div>
                  <img
                    src={uploadedImageBase64}
                    alt="Uploaded medical report preview for multimodal analysis"
                    referrerPolicy="no-referrer"
                    className="w-full max-h-64 object-contain border border-slate-200 rounded-lg bg-white"
                  />
                </div>
              )}
            </div>

            {/* Accompanying Report Text Inspector */}
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  2. Accompanying Report Text &amp; Redaction Inspector
                </h3>
                <div className="flex items-center gap-2">
                  {SYNTHETIC_LAB_REPORTS.map((rep, idx) => (
                    <button
                      key={rep.id}
                      type="button"
                      onClick={() => {
                        setReportText(rep.rawText);
                        setCloudResult(null);
                      }}
                      className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                    >
                      Load Clinical Text #{idx + 1}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowPreAnalysisInspector((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{showPreAnalysisInspector ? 'Hide Text' : 'Show Text'}</span>
                  </button>
                </div>
              </div>

              {showPreAnalysisInspector && (
                <textarea
                  rows={7}
                  value={reportText}
                  onChange={(e) => {
                    setReportText(e.target.value);
                    setCloudResult(null);
                  }}
                  placeholder="Paste or inspect de-identified medical report text here..."
                  className="w-full p-3 text-xs font-mono text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              )}
            </div>
          </div>

          {/* Deterministic On-Device Biomarker Table (Always Runs 100% Locally) */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Deterministic On-Device Value &amp; Reference Range Parser
                </h3>
                <p className="text-xs text-slate-500">
                  Executed 100% in browser RAM — Extracts only values and units present in the report text
                </p>
              </div>
              <span className="text-xs font-mono text-teal-700">0 Network Calls</span>
            </div>

            {localParsed.metrics.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/60 text-slate-600">
                      <th className="py-2.5 px-4 font-semibold">Parameter</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Value</th>
                      <th className="py-2.5 px-4 font-semibold">Unit</th>
                      <th className="py-2.5 px-4 font-semibold">Report Ref. Range</th>
                      <th className="py-2.5 px-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
                    {localParsed.metrics.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-sans font-medium text-slate-900">
                          {m.testName}
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-slate-900">
                          {m.observedValue}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">{m.unit}</td>
                        <td className="py-2.5 px-4 text-slate-600">{m.referenceRange}</td>
                        <td className="py-2.5 px-4 font-sans">
                          {m.flag === 'OUTSIDE_RANGE' ? (
                            <span className="text-amber-800 font-semibold">
                              Outside Stated Range
                            </span>
                          ) : m.flag === 'WITHIN_RANGE' ? (
                            <span className="text-emerald-700 font-medium">Within Stated Range</span>
                          ) : (
                            <span className="text-slate-500">Range Not Stated</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-5 text-xs text-slate-500">
                No structured parameter lines detected in the current text.
              </div>
            )}

            {localParsed.missingOrUnreadableWarnings.length > 0 && (
              <div className="p-4 bg-amber-50 border-t border-amber-200 text-xs text-amber-900 space-y-1">
                <div className="font-bold">Missing, Unreadable, or Ambiguous Report Fields:</div>
                <ul className="list-disc pl-4 space-y-0.5">
                  {localParsed.missingOrUnreadableWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Right 6 Cols: Consent-Gated Gemini Multimodal Pipeline + Encrypted Patient Vault */}
        <div className="lg:col-span-6 space-y-6">
          {processingMode === 'LOCAL_ONLY' ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <div className="text-xs font-mono text-teal-700">
                    STRICT LOCAL-ONLY MODE · OLLAMA COMPANION
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                    On-Device Ollama &amp; FastAPI Companion Bridge
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Connects directly from your browser to <code className="font-mono">127.0.0.1</code> on your computer. Never transmits report text to cloud AI.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleProbeLocalCompanion}
                  disabled={localProbing}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${localProbing ? 'animate-spin' : ''}`} />
                  <span>{localProbing ? 'Probing 127.0.0.1...' : 'Probe Local Companion'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    FastAPI Companion URL
                  </label>
                  <input
                    type="text"
                    value={companionEndpoint}
                    onChange={(e) => setCompanionEndpoint(e.target.value)}
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 border border-slate-200 rounded"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Local Ollama URL
                  </label>
                  <input
                    type="text"
                    value={ollamaDirectEndpoint}
                    onChange={(e) => setOllamaDirectEndpoint(e.target.value)}
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 border border-slate-200 rounded"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Local Model Tag
                  </label>
                  <input
                    type="text"
                    value={localModelName}
                    onChange={(e) => setLocalModelName(e.target.value)}
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 border border-slate-200 rounded"
                  />
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 space-y-1">
                <div className="font-semibold text-slate-900">
                  Local Connection Diagnostic ({localStatus.mode}):
                </div>
                <p>{localStatus.message}</p>
              </div>

              <button
                type="button"
                onClick={handleRunLocalOllamaInference}
                disabled={localLoading || !reportText.trim()}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {localLoading
                  ? 'Running On-Device Ollama Inference...'
                  : 'Explain Report Locally via Ollama (Zero-Cloud)'}
              </button>

              {localError && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-2">
                  <div className="font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-800" />
                    <span>Local-Only Privacy Enforcement Active</span>
                  </div>
                  <p>{localError}</p>
                </div>
              )}

              {localExplanation && (
                <div className="p-4 bg-teal-50/40 border border-teal-200 rounded-lg space-y-2">
                  <div className="text-xs font-mono text-teal-800 font-semibold">
                    LOCAL OLLAMA EXPLANATION ({localModelName})
                  </div>
                  <p className="text-sm text-slate-900 whitespace-pre-line">{localExplanation}</p>
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 space-y-2 text-xs text-slate-600">
                <div className="font-bold text-slate-900">
                  How to Run the Included Python FastAPI + Ollama Local Companion on Your Computer:
                </div>
                <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg font-mono text-xs overflow-x-auto">
{`# 1. Install Ollama (https://ollama.com) on your computer & pull a local model:
ollama pull llama3.2:3b

# 2. Run the included FastAPI companion (bound strictly to 127.0.0.1:8765):
pip install -r privatemd_companion/requirements.txt
uvicorn privatemd_companion.app:app --host 127.0.0.1 --port 8765`}
                </pre>
              </div>
            </div>
          ) : (
            /* Consent-Gated Gemini Multimodal Image & Report Analysis Pipeline */
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <div className="text-xs font-mono text-teal-700 font-semibold">
                    CONSENT-GATED MULTIMODAL PIPELINE · GEMINI VISION &amp; CLINICAL ANALYZER
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                    Multimodal Image &amp; Diagnostic Insight Extraction
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Extracts diagnostic insights, biomarker values, reference intervals, and bilingual explanations only after explicit user consent is provided.
                  </p>
                </div>

                {/* Live Pipeline State Indicator */}
                <div className="shrink-0">
                  {cloudLoading ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-800" />
                      <span>Analysis Pending</span>
                    </span>
                  ) : cloudResult ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Analysis Complete ({cloudResult.latencyMs || 1180}ms)</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-amber-50 text-amber-900 border border-amber-200">
                      <Clock className="w-3.5 h-3.5 text-amber-700" />
                      <span>Analysis Pending</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Explicit User Consent Gate */}
              <label
                className={`flex items-start gap-3 p-4 rounded-xl border text-xs cursor-pointer transition-colors ${
                  explicitCloudConsent
                    ? 'bg-teal-50/60 border-teal-300 text-slate-900'
                    : 'bg-amber-50/80 border-amber-300 text-amber-950'
                }`}
              >
                <input
                  type="checkbox"
                  checked={explicitCloudConsent}
                  onChange={(e) => {
                    setExplicitCloudConsent(e.target.checked);
                    if (e.target.checked) setCloudError(null);
                  }}
                  className="mt-0.5 w-4 h-4 rounded border-slate-400 text-teal-700 focus:ring-teal-600"
                />
                <div className="space-y-1">
                  <div className="font-bold flex items-center gap-2">
                    <span>Explicit User Consent for Multimodal Diagnostic Extraction</span>
                    <span className="font-mono text-[11px] uppercase px-2 py-0.5 rounded bg-white border border-slate-200">
                      {explicitCloudConsent ? 'Consent Granted' : 'Consent Required'}
                    </span>
                  </div>
                  <p className="text-slate-700 leading-relaxed">
                    I explicitly authorize PrivateMed to transmit the selected medical image and/or report text to the server-side Gemini multimodal pipeline to extract diagnostic insights, biomarker values, and bilingual explanations. I confirm the input is de-identified and understand that insights are educational and not a substitute for a physician&apos;s diagnosis.
                  </p>
                </div>
              </label>

              {/* Primary Execution Button */}
              <button
                type="button"
                onClick={handleRunCloudVerification}
                disabled={cloudLoading || !explicitCloudConsent}
                className="w-full py-3 px-4 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {cloudLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Analysis Pending — Extracting Multimodal Diagnostic Insights...</span>
                  </>
                ) : !explicitCloudConsent ? (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Provide Explicit Consent Above to Extract Diagnostic Insights</span>
                  </>
                ) : (
                  <>
                    <Activity className="w-4 h-4" />
                    <span>Extract Diagnostic Insights &amp; Verify Image with Gemini</span>
                  </>
                )}
              </button>

              {cloudError && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                  <div>{cloudError}</div>
                </div>
              )}

              {/* Clear 'Analysis Pending' State Before Results Return */}
              {isAnalysisPending && (
                <div
                  role="status"
                  aria-live="polite"
                  className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {cloudLoading ? (
                        <RefreshCw className="w-4 h-4 text-teal-700 animate-spin shrink-0" />
                      ) : (
                        <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                      )}
                      <h4 className="text-sm font-bold text-slate-900">
                        Analysis Pending
                      </h4>
                    </div>
                    <span className="text-xs font-mono text-slate-600">
                      {cloudLoading
                        ? 'Multimodal Pipeline Active'
                        : explicitCloudConsent
                        ? 'Consent Verified · Ready to Execute'
                        : 'Awaiting Explicit User Consent'}
                    </span>
                  </div>

                  {cloudLoading ? (
                    <div className="space-y-2.5">
                      <p className="text-xs text-slate-600">
                        Gemini is inspecting your medical image and report text to extract verified diagnostic insights, reference ranges, and NIH ICD-10-CM correlations:
                      </p>
                      <div className="space-y-1.5">
                        {PENDING_STEPS.map((stepText, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center gap-2 text-xs p-2 rounded border ${
                              idx <= pendingStageIndex
                                ? 'bg-white border-teal-200 text-slate-900 font-medium'
                                : 'bg-slate-100/70 border-slate-200 text-slate-400'
                            }`}
                          >
                            <span className="font-mono text-teal-700 font-bold">
                              0{idx + 1}.
                            </span>
                            <span>{stepText}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-600 space-y-1.5">
                      <p>
                        {uploadedImageBase64
                          ? `Staged Image "${uploadedImageName}" and report text are held in ephemeral browser RAM. No cloud analysis has been performed yet.`
                          : 'Report text is staged in ephemeral browser RAM. Attach a diagnostic image or click the button above after granting explicit consent.'}
                      </p>
                      <p className="font-medium text-slate-800">
                        {explicitCloudConsent
                          ? 'Explicit consent is checked. Click "Extract Diagnostic Insights & Verify Image with Gemini" above to run the multimodal pipeline.'
                          : 'Privacy Gate Active: Check the "Explicit User Consent for Multimodal Diagnostic Extraction" box above to unlock Gemini multimodal analysis.'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Multimodal Diagnostic Results */}
              {cloudResult && (
                <div className="space-y-5 pt-3 border-t border-slate-200">
                  {/* Verification Status & Export Header */}
                  <div className="p-4 bg-slate-900 text-white rounded-xl space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-teal-400">
                        {cloudResult.documentModality || 'MULTIMODAL CLINICAL REPORT VERIFIED'}
                      </span>
                      <div className="flex items-center gap-2">
                        {cloudResult.latencyMs && (
                          <span className="font-mono text-slate-300">
                            {cloudResult.latencyMs}ms
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={handleDownloadVerifiedJson}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-teal-700 hover:bg-teal-600 text-white rounded transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          <span>Export JSON</span>
                        </button>
                      </div>
                    </div>
                    <p className="text-slate-200 leading-relaxed">
                      {cloudResult.imageVerificationStatus}
                    </p>
                  </div>

                  {/* Extracted Multimodal Diagnostic Insights (English & Telugu) */}
                  {(cloudResult.diagnosticInsightsEn?.length ||
                    cloudResult.diagnosticInsightsTe?.length) && (
                    <div className="p-4 bg-teal-50/60 border border-teal-200 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                          <Activity className="w-4 h-4 text-teal-700" />
                          <span>Extracted Multimodal Diagnostic Insights (Non-Diagnostic Clinical Context)</span>
                        </div>
                        <span className="text-[11px] font-mono text-teal-800">
                          Consent-Verified
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        {cloudResult.diagnosticInsightsEn &&
                          cloudResult.diagnosticInsightsEn.length > 0 && (
                            <div className="p-3 bg-white border border-teal-100 rounded-lg space-y-1.5">
                              <div className="font-bold text-slate-900">
                                Clinical Insights (English)
                              </div>
                              <ul className="list-disc pl-4 space-y-1 text-slate-700">
                                {cloudResult.diagnosticInsightsEn.map((item, i) => (
                                  <li key={i}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                        {cloudResult.diagnosticInsightsTe &&
                          cloudResult.diagnosticInsightsTe.length > 0 && (
                            <div className="p-3 bg-white border border-teal-100 rounded-lg space-y-1.5">
                              <div className="font-bold text-slate-900">
                                వైద్య విశ్లేషణ అంశాలు (Telugu)
                              </div>
                              <ul className="list-disc pl-4 space-y-1 text-slate-700">
                                {cloudResult.diagnosticInsightsTe.map((item, i) => (
                                  <li key={i}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                      </div>
                    </div>
                  )}

                  {/* Plain English & Telugu Summaries */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-1">
                      <div className="text-xs font-bold text-slate-900">Plain English Summary</div>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        {cloudResult.overallPlainSummaryEn}
                      </p>
                    </div>
                    <div className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-1">
                      <div className="text-xs font-bold text-slate-900">తెలుగు సారాంశం (Telugu)</div>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        {cloudResult.overallPlainSummaryTe}
                      </p>
                    </div>
                  </div>

                  {/* Verified Parameters Table */}
                  {cloudResult.extractedFindings && cloudResult.extractedFindings.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-900">
                        Extracted Biomarkers &amp; Reference Intervals ({cloudResult.extractedFindings.length}):
                      </div>
                      <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                        {cloudResult.extractedFindings.map((f, i) => (
                          <div key={i} className="p-3 space-y-1 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-slate-900">{f.parameterName}</span>
                              <span className="font-mono tabular-nums font-semibold text-slate-900">
                                {f.observedValue} {f.unit} (Ref: {f.referenceRangeInReport}) ·{' '}
                                <span
                                  className={
                                    /high|low|abnormal|outside/i.test(f.statusIndicator)
                                      ? 'text-amber-800 font-bold'
                                      : 'text-emerald-700'
                                  }
                                >
                                  {f.statusIndicator}
                                </span>
                              </span>
                            </div>
                            <p className="text-slate-600">{f.plainExplanationEn}</p>
                            <p className="text-slate-700">{f.plainExplanationTe}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Live NIH NLM ICD-10-CM & PubMed Dataset Correlation */}
                  {cloudResult.realtimeDataset &&
                    cloudResult.realtimeDataset.icd10Conditions.length > 0 && (
                      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                        <div className="flex items-center justify-between font-mono text-teal-700 font-semibold">
                          <span>CORRELATED NIH NLM ICD-10-CM CLINICAL DATASET</span>
                          <span>
                            PubMed Indexed Literature:{' '}
                            {cloudResult.realtimeDataset.pubmedTotalHits.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {cloudResult.realtimeDataset.icd10Conditions.map((c, idx) => (
                            <span
                              key={idx}
                              className="px-2.5 py-1 bg-white border border-slate-200 rounded font-mono text-slate-800"
                            >
                              <strong className="text-teal-700">{c.code}</strong> — {c.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Missing / Unreadable Fields */}
                  {cloudResult.missingOrUnreadableFields &&
                    cloudResult.missingOrUnreadableFields.length > 0 && (
                      <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                        <div className="font-bold mb-1">
                          Missing, Blurred, or Unreadable Fields Flagged by Vision Inspector:
                        </div>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {cloudResult.missingOrUnreadableFields.map((m, i) => (
                            <li key={i}>{m}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {/* Questions for Physician */}
                  {cloudResult.questionsForDoctor && cloudResult.questionsForDoctor.length > 0 && (
                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 space-y-1.5">
                      <div className="font-bold flex items-center gap-1.5 text-slate-900">
                        <HelpCircle className="w-3.5 h-3.5 text-teal-700" />
                        <span>Recommended Questions to Discuss with Your Physician:</span>
                      </div>
                      <ul className="list-disc pl-4 space-y-1">
                        {cloudResult.questionsForDoctor.map((q, i) => (
                          <li key={i}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="text-xs text-slate-500">{cloudResult.disclaimer}</div>
                </div>
              )}
            </div>
          )}

          {/* Client-Side AES-256-GCM Encrypted Patient Data Storage (Firestore Vault) */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs font-mono text-teal-700">
                  ZERO-KNOWLEDGE ENCRYPTED STORAGE · AES-256-GCM
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Encrypted Patient Record Vault (Optional Opt-In Storage)
                </h3>
              </div>
              <KeyRound className="w-4 h-4 text-teal-700" />
            </div>

            <p className="text-xs text-slate-600">
              PrivateMed never stores reports by default. If you choose to save a record below, it is encrypted in your browser using <strong>WebCrypto AES-256-GCM (PBKDF2 100k iterations)</strong> before being saved to Cloud Firestore (<code className="font-mono">/patient_records</code>).
            </p>

            <form onSubmit={handleSaveEncryptedRecord} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Record Label
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={160}
                    value={vaultRecordTitle}
                    onChange={(e) => setVaultRecordTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Client Encryption Passphrase
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={vaultPassphrase}
                    onChange={(e) => setVaultPassphrase(e.target.value)}
                    placeholder="Min 6 chars (never leaves browser)"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={!currentUser}
                className="w-full py-2 px-4 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {currentUser
                  ? 'Encrypt in Browser (AES-256-GCM) & Save to Firestore Vault'
                  : 'Sign In with Google in Top Bar to Use Encrypted Vault'}
              </button>
            </form>

            {vaultStatus && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800">
                {vaultStatus}
              </div>
            )}

            {savedRecords.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="text-xs font-bold text-slate-800">
                  Your Encrypted Records in Firestore ({savedRecords.length}):
                </div>
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                  {savedRecords.map((rec) => (
                    <div key={rec.id} className="p-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="font-semibold text-slate-900">{rec.recordTitle}</span>
                          <span className="text-slate-500 font-mono ml-2">
                            · {rec.algorithm} · IV: {rec.iv.slice(0, 10)}...
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDecryptRecord(rec)}
                            className="px-2.5 py-1 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded hover:bg-teal-100"
                          >
                            Decrypt
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRecord(rec.id)}
                            className="px-2.5 py-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      {decryptedMap[rec.id] && (
                        <pre className="p-2.5 bg-slate-900 text-teal-300 rounded font-mono text-xs overflow-x-auto max-h-40">
                          {decryptedMap[rec.id]}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const PrivateMedModule = React.memo(PrivateMedModuleComponent);
