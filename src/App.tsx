import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  ArrowRight,
  HelpCircle,
  X,
  RotateCcw,
} from 'lucide-react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  auth,
  signInWithGoogle,
  signOutUser,
  testFirestoreConnection,
} from './lib/firebase';
import {
  ActiveWorkspace,
  STORAGE_KEYS,
  readCachedWorkspace,
  readCachedLanguage,
  readLocalStorage,
  writeLocalStorage,
  clearHealthBridgeCache,
} from './lib/storageCache';
import { HealthGuideModule } from './components/HealthGuideModule';
import { HealthAccessModule } from './components/HealthAccessModule';
import { ClinicConnectModule } from './components/ClinicConnectModule';
import { PrivateMedModule } from './components/PrivateMedModule';
import { MedStructModule } from './components/MedStructModule';
import { BioScienceModule } from './components/BioScienceModule';
import { GovernanceAndStatusView } from './components/GovernanceAndStatusView';
import { apiFetchStatus } from './lib/apiClient';

export default function App() {
  const [activeTab, setActiveTabState] = useState<ActiveWorkspace>(() =>
    readCachedWorkspace('overview')
  );
  const [visitedTabs, setVisitedTabs] = useState<Record<ActiveWorkspace, boolean>>(() => {
    const initial = readCachedWorkspace('overview');
    return {
      overview: true,
      healthguide: initial === 'healthguide',
      healthaccess: initial === 'healthaccess',
      clinicconnect: initial === 'clinicconnect',
      privatemed: initial === 'privatemed',
      medstruct: initial === 'medstruct',
      bioscience: initial === 'bioscience',
      governance: initial === 'governance',
    };
  });

  const [language, setLanguageState] = useState<'en' | 'te'>(() => readCachedLanguage('en'));
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [firestoreConnected, setFirestoreConnected] = useState(true);
  const [serviceStatus, setServiceStatus] = useState<any>(null);

  // Shared cross-module state with localStorage caching
  const [globalSearchQuery, setGlobalSearchQueryState] = useState<string>(() =>
    readLocalStorage<string>(STORAGE_KEYS.GLOBAL_SEARCH_QUERY, '')
  );
  const [committedSearchQuery, setCommittedSearchQuery] = useState<string>(() =>
    readLocalStorage<string>(STORAGE_KEYS.GLOBAL_SEARCH_QUERY, '')
  );
  const [searchSubmissionId, setSearchSubmissionId] = useState<number>(0);

  const [healthAccessPrefill, setHealthAccessPrefillState] = useState<string>(() =>
    readLocalStorage<string>(STORAGE_KEYS.HEALTHACCESS_PREFILL, '')
  );
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const setActiveTab = useCallback((nextTab: ActiveWorkspace) => {
    setActiveTabState(nextTab);
    setVisitedTabs((prev) => (prev[nextTab] ? prev : { ...prev, [nextTab]: true }));
    writeLocalStorage(STORAGE_KEYS.ACTIVE_TAB, nextTab);
  }, []);

  const setLanguage = useCallback((nextLang: 'en' | 'te') => {
    setLanguageState(nextLang);
    writeLocalStorage(STORAGE_KEYS.LANGUAGE, nextLang);
  }, []);

  const setGlobalSearchQuery = useCallback((nextQuery: string) => {
    setGlobalSearchQueryState(nextQuery);
    writeLocalStorage(STORAGE_KEYS.GLOBAL_SEARCH_QUERY, nextQuery);
  }, []);

  const handleSendToHealthAccess = useCallback(
    (text: string) => {
      setHealthAccessPrefillState(text);
      writeLocalStorage(STORAGE_KEYS.HEALTHACCESS_PREFILL, text);
      setActiveTab('healthaccess');
    },
    [setActiveTab]
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
    });

    testFirestoreConnection().then((res) => setFirestoreConnected(res.connected));

    apiFetchStatus()
      .then((data) => setServiceStatus(data))
      .catch(() => {});

    return () => unsub();
  }, []);

  const handleGlobalSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = globalSearchQuery.trim();
    if (!trimmed) return;
    writeLocalStorage(STORAGE_KEYS.GLOBAL_SEARCH_QUERY, trimmed);
    setCommittedSearchQuery(trimmed);
    setSearchSubmissionId((v) => v + 1);
    setActiveTab('healthguide');
  };

  const handleAuthAction = async () => {
    setAuthError(null);
    if (currentUser) {
      await signOutUser();
    } else {
      try {
        await signInWithGoogle();
      } catch (err) {
        setAuthError(
          err instanceof Error ? err.message : 'Google Sign-In popup was closed or blocked.'
        );
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      {/* Strict 3-Zone Top Navigation Bar Contract */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 flex items-center justify-between gap-8 px-6 py-4">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className="text-lg font-display font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 text-left"
        >
          HealthBridge AI
        </button>

        {/* Zone 2: 5 clean single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setActiveTab('healthguide')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'healthguide' ? 'text-teal-700 font-semibold underline underline-offset-8' : ''
            }`}
          >
            HealthGuide
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('healthaccess')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'healthaccess' ? 'text-teal-700 font-semibold underline underline-offset-8' : ''
            }`}
          >
            HealthAccess
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('clinicconnect')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'clinicconnect' ? 'text-teal-700 font-semibold underline underline-offset-8' : ''
            }`}
          >
            ClinicConnect
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('privatemed')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'privatemed' ? 'text-teal-700 font-semibold underline underline-offset-8' : ''
            }`}
          >
            PrivateMed
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('medstruct')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'medstruct' ? 'text-teal-700 font-semibold underline underline-offset-8' : ''
            }`}
          >
            MedStruct
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bioscience')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'bioscience' ? 'text-teal-700 font-semibold underline underline-offset-8' : ''
            }`}
          >
            BioScience
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleAuthAction}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            {!authReady
              ? 'Loading Auth...'
              : currentUser
              ? `Sign Out (${currentUser.displayName?.split(' ')[0] || 'Account'})`
              : 'Sign In with Google'}
          </button>
        </div>
      </header>

      {/* Workspace Control & Unified Global Search Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3">
        <div className="max-w-[1360px] mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Module Switcher Tabs (Mobile + Desktop) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            {[
              { id: 'overview', label: 'Platform Overview' },
              { id: 'healthguide', label: '01. HealthGuide' },
              { id: 'healthaccess', label: '02. HealthAccess' },
              { id: 'clinicconnect', label: '03. ClinicConnect' },
              { id: 'privatemed', label: '04. PrivateMed' },
              { id: 'medstruct', label: '05. MedStruct' },
              { id: 'bioscience', label: '06. BioScience' },
              { id: 'governance', label: 'Status & Acceptance' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id as ActiveWorkspace)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === item.id
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Right Controls: Global Search Input, Language Switcher, Onboarding Guide */}
          <div className="flex flex-wrap items-center gap-3">
            <form onSubmit={handleGlobalSearchSubmit} className="flex items-center gap-1.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={globalSearchQuery}
                  onChange={(e) => setGlobalSearchQuery(e.target.value)}
                  placeholder={
                    language === 'te'
                      ? 'ఆరోగ్య సమాచారం శోధించండి...'
                      : 'Global real-time health search...'
                  }
                  className="w-56 sm:w-64 pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                Ask
              </button>
            </form>

            {/* English & Telugu Language Selector */}
            <div
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0"
              role="group"
              aria-label="Language selector"
            >
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                  language === 'en' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLanguage('te')}
                className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                  language === 'te' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                తెలుగు (Telugu)
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowOnboarding((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <HelpCircle className="w-3.5 h-3.5 text-teal-700" />
              <span>First-Time Guide</span>
            </button>
          </div>
        </div>
      </div>

      {authError && (
        <div className="max-w-[1360px] mx-auto w-full px-6 pt-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center justify-between">
            <span>Authentication Notice: {authError}</span>
            <button type="button" onClick={() => setAuthError(null)} className="font-bold">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Helpful First-Time User Onboarding Panel */}
      {showOnboarding && (
        <div className="max-w-[1360px] mx-auto w-full px-6 pt-6">
          <div className="bg-slate-900 text-white rounded-xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-3">
              <div>
                <div className="text-xs font-mono text-teal-400">
                  FIRST-TIME USER ONBOARDING &amp; LIVE DEMO WALKTHROUGH
                </div>
                <h2 className="text-lg font-bold mt-0.5">
                  How to Explore &amp; Verify All Five Connected Healthcare AI Modules
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowOnboarding(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-xs">
              <div className="space-y-1">
                <div className="font-bold text-teal-400">01. HealthGuide</div>
                <p className="text-slate-300">
                  Ask general health questions with real Google Search grounding and inspect actual WHO/MoHFW source links, or test the Emergency Triage red-flag detector.
                </p>
              </div>
              <div className="space-y-1">
                <div className="font-bold text-teal-400">02. HealthAccess</div>
                <p className="text-slate-300">
                  Translate and simplify medical instructions between English and Telugu (తెలుగు) while verifying that all numeric dosages and warnings are preserved verbatim.
                </p>
              </div>
              <div className="space-y-1">
                <div className="font-bold text-teal-400">03. ClinicConnect</div>
                <p className="text-slate-300">
                  Query approved clinic doctors, fees, and hours backed by Cloud Firestore, and see how unknown or real-time booking requests escalate to clinic staff.
                </p>
              </div>
              <div className="space-y-1">
                <div className="font-bold text-teal-400">04. PrivateMed</div>
                <p className="text-slate-300">
                  Inspect lab values locally in browser RAM or via local Ollama (127.0.0.1), or opt-in to verify a generated synthetic lab report image and store it in the AES-256-GCM encrypted Firestore vault.
                </p>
              </div>
              <div className="space-y-1">
                <div className="font-bold text-teal-400">05. MedStruct</div>
                <p className="text-slate-300">
                  Convert de-identified clinical notes into schema-validated JSON, distinguish explicit negatives from missing data, and test the anti-hallucination numeric validator.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-6 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-12">
            {/* Hero Section — 2-Column Split with Resilient Architectural & Clinical Vector Illustration */}
            <section className="bg-white border border-slate-200 rounded-xl p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="text-xs font-medium text-teal-700">
                    Unified Healthcare Intelligence Platform · English &amp; తెలుగు (Telugu) · Real-Time NIH, RxNorm &amp; PubMed Datasets Connected
                  </div>
                  <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-display font-bold text-slate-900 leading-[1.15]">
                    Source-Grounded Public Health, Private Report Clarity, and Validated Clinical Documentation
                  </h1>
                  <p className="text-base text-slate-600 leading-relaxed max-w-2xl">
                    HealthBridge AI integrates five specialized healthcare workflows into a single privacy-first architecture—combining real-time NIH NLM ICD-10-CM, RxNorm, and PubMed search grounding, bilingual English and Telugu medical communication, Firestore-backed clinic knowledge, local-first report explanation, and schema-validated clinical note extraction.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('healthguide')}
                    className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>Launch HealthGuide &amp; Live Dataset Search</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('privatemed')}
                    className="px-4 py-3 text-sm font-semibold text-slate-800 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
                  >
                    Open PrivateMed Report &amp; Image Verifier
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowOnboarding(true)}
                    className="px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
                  >
                    Platform Guide
                  </button>
                </div>

                {/* Unboxed Metadata Bar */}
                <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>High-Speed Gemini Flash Engine (~1.2s)</span>
                  <span aria-hidden="true">·</span>
                  <span>Live NIH ICD-10-CM, RxNorm &amp; PubMed APIs</span>
                  <span aria-hidden="true">·</span>
                  <span>Cloud Firestore RBAC</span>
                  <span aria-hidden="true">·</span>
                  <span>AES-256-GCM Client Encryption</span>
                  <span aria-hidden="true">·</span>
                  <span>Local Ollama Companion Ready</span>
                </div>
              </div>

              {/* Right Column: High-Craft Clinical Architecture Diagram (Zero-Broken-Image Policy) */}
              <div className="lg:col-span-5 bg-slate-900 text-white rounded-xl p-6 flex flex-col justify-between space-y-6">
                <div className="space-y-1">
                  <div className="text-xs font-mono text-teal-400">
                    THREE-TIER PRIVACY &amp; EVIDENCE ARCHITECTURE
                  </div>
                  <h2 className="text-lg font-bold">
                    Strict Separation of Public Web, Approved Clinic Data &amp; Private Patient Reports
                  </h2>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3.5 bg-slate-800/90 border border-slate-700 rounded-lg space-y-1">
                    <div className="flex items-center justify-between font-mono text-teal-300">
                      <span>TIER 01 · PUBLIC HEALTH GROUNDING</span>
                      <span>Google Search + Gemini</span>
                    </div>
                    <p className="text-slate-300">
                      HealthGuide &amp; HealthAccess retrieve real-time citations from WHO, MoHFW India, NCDC, and peer-reviewed portals with English &amp; Telugu translation.
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-800/90 border border-slate-700 rounded-lg space-y-1">
                    <div className="flex items-center justify-between font-mono text-teal-300">
                      <span>TIER 02 · APPROVED CLINIC RECORDS</span>
                      <span>Cloud Firestore RBAC</span>
                    </div>
                    <p className="text-slate-300">
                      ClinicConnect answers strictly from staff-verified Firestore documents (<code className="font-mono">/clinics</code>, <code className="font-mono">/clinic_faqs</code>) and escalates unknown queries.
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-800/90 border border-slate-700 rounded-lg space-y-1">
                    <div className="flex items-center justify-between font-mono text-teal-300">
                      <span>TIER 03 · PRIVATE REPORTS &amp; CLINICAL JSON</span>
                      <span>127.0.0.1 Ollama + AES-256-GCM</span>
                    </div>
                    <p className="text-slate-300">
                      PrivateMed defaults to local-only Ollama companion execution. Optional cloud image verification and Firestore storage use explicit consent and AES-256-GCM encryption.
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>Safety: Deterministic Emergency Triage</span>
                  <span>108 / 112 / 911</span>
                </div>
              </div>
            </section>

            {/* Five Integrated Module Workspaces Grid */}
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-teal-700">
                    Integrated Five-Module Healthcare Suite
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    Select a Specialized Workspace
                  </h2>
                </div>
                <span className="text-xs text-slate-500">
                  All five modules share unified bilingual controls and strict clinical safety boundaries
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-mono text-teal-700">
                      <span>01. HEALTHGUIDE</span>
                      <span>Google Search Grounding</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">
                      Public Health Education &amp; Source Inspector
                    </h3>
                    <p className="text-sm text-slate-600">
                      Answers general health, hygiene, prevention, and first-aid awareness questions grounded in real web sources (WHO, MoHFW, NCDC) with urgent symptom triage interception.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('healthguide')}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    Open HealthGuide Workspace
                  </button>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-mono text-teal-700">
                      <span>02. HEALTHACCESS</span>
                      <span>English &amp; తెలుగు</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">
                      Multilingual Medical Simplification
                    </h3>
                    <p className="text-sm text-slate-600">
                      Translates and simplifies complex medical instructions into clear English and Telugu while auditing that every dosage, unit, and clinical warning is preserved verbatim.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('healthaccess')}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    Open HealthAccess Workspace
                  </button>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-mono text-teal-700">
                      <span>03. CLINICCONNECT</span>
                      <span>Firestore Knowledge Base</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">
                      Approved Clinic Information Assistant
                    </h3>
                    <p className="text-sm text-slate-600">
                      Answers questions using approved clinic hours, doctor rosters, and bilingual FAQs stored in Cloud Firestore. Escalates unknown or real-time booking inquiries to staff.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('clinicconnect')}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    Open ClinicConnect Workspace
                  </button>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-mono text-teal-700">
                      <span>04. PRIVATEMED</span>
                      <span>Local Ollama + Multimodal Opt-In</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">
                      Privacy-First Report &amp; Image Explanation
                    </h3>
                    <p className="text-sm text-slate-600">
                      Defaults to local-only Ollama companion processing and deterministic on-device biomarker extraction, plus separate opt-in real-time medical image verification and AES-256-GCM vault storage.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('privatemed')}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    Open PrivateMed Workspace
                  </button>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-mono text-teal-700">
                      <span>05. MEDSTRUCT</span>
                      <span>JSON Schema + Grounding Audit</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">
                      Clinical Note Structuring &amp; Validation
                    </h3>
                    <p className="text-sm text-slate-600">
                      Transforms de-identified clinical notes into structured JSON, separates absent information from explicit negative findings, and runs independent numeric grounding checks.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('medstruct')}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    Open MedStruct Workspace
                  </button>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-mono text-teal-700">
                      <span>06. BIOSCIENCE</span>
                      <span>AlphaFold DB + PubChem + Search</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">
                      Macromolecular, Pharmacology &amp; Genomic Intelligence
                    </h3>
                    <p className="text-sm text-slate-600">
                      AlphaFold 3D structure prediction with 4-tier pLDDT confidence scale, Lipinski Rule of 5 drug scorecard, ClinVar ACMG variant classification, and Europe PMC peer-reviewed citations.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('bioscience')}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors"
                  >
                    Open BioScience Workspace
                  </button>
                </div>

                <div className="bg-slate-900 text-white rounded-xl p-6 flex flex-col justify-between space-y-5">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-mono text-teal-400">
                      <span>SYSTEM GOVERNANCE</span>
                      <span>QA &amp; Security Spec</span>
                    </div>
                    <h3 className="text-lg font-bold">
                      Service Status, Security Rules &amp; Acceptance Matrix
                    </h3>
                    <p className="text-sm text-slate-300">
                      Inspect live connection state, Firestore RBAC rules, Python FastAPI local companion instructions, expected service costs, and the complete feature acceptance table.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('governance')}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-slate-900 bg-white rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    Inspect Status &amp; Acceptance Matrix
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {visitedTabs.healthguide && (
          <div className={activeTab === 'healthguide' ? 'block' : 'hidden'}>
            <HealthGuideModule
              language={language}
              initialQuery={committedSearchQuery}
              searchSubmissionId={searchSubmissionId}
              currentUser={currentUser}
              onSendToHealthAccess={handleSendToHealthAccess}
            />
          </div>
        )}

        {visitedTabs.healthaccess && (
          <div className={activeTab === 'healthaccess' ? 'block' : 'hidden'}>
            <HealthAccessModule language={language} prefilledText={healthAccessPrefill} />
          </div>
        )}

        {visitedTabs.clinicconnect && (
          <div className={activeTab === 'clinicconnect' ? 'block' : 'hidden'}>
            <ClinicConnectModule language={language} currentUser={currentUser} />
          </div>
        )}

        {visitedTabs.privatemed && (
          <div className={activeTab === 'privatemed' ? 'block' : 'hidden'}>
            <PrivateMedModule language={language} currentUser={currentUser} />
          </div>
        )}

        {visitedTabs.medstruct && (
          <div className={activeTab === 'medstruct' ? 'block' : 'hidden'}>
            <MedStructModule currentUser={currentUser} />
          </div>
        )}

        {visitedTabs.bioscience && (
          <div className={activeTab === 'bioscience' ? 'block' : 'hidden'}>
            <BioScienceModule language={language} initialQuery={committedSearchQuery || 'TP53'} />
          </div>
        )}

        {visitedTabs.governance && (
          <div className={activeTab === 'governance' ? 'block' : 'hidden'}>
            <GovernanceAndStatusView
              serviceStatus={serviceStatus}
              firestoreConnected={firestoreConnected}
            />
          </div>
        )}
      </main>

      {/* Quiet, Honest Clinical Disclaimer Footer */}
      <footer className="bg-white border-t border-slate-200 px-6 py-5 mt-12">
        <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            <strong>HealthBridge AI</strong> — Unified Healthcare Intelligence Platform. For educational, communication, and clinical structuring demonstration only; never a substitute for a licensed physician.
          </div>
          <div className="flex flex-wrap items-center gap-4 shrink-0">
            <button
              type="button"
              onClick={() => {
                clearHealthBridgeCache();
                setGlobalSearchQueryState('');
                setCommittedSearchQuery('');
                setHealthAccessPrefillState('');
                setActiveTab('overview');
              }}
              className="inline-flex items-center gap-1 hover:text-slate-900 underline"
              title="Clear cached search query and workspace state from localStorage"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Local Cache</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('governance')}
              className="hover:text-slate-900 underline"
            >
              Acceptance Status Matrix &amp; Setup Guide
            </button>
            <span>Emergency: 108 / 112 (India) · 911 (US)</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

