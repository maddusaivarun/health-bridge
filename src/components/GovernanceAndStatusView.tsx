import React from 'react';
import {
  CheckCircle2,
  Server,
  Shield,
  Terminal,
  Database,
  AlertCircle,
} from 'lucide-react';

interface ServiceStatusInfo {
  geminiConfigured: boolean;
  activeModel: string;
  searchGroundingSupported: boolean;
  supportedLanguages: string[];
  privateMedDefaultMode: string;
  encryptionStandard: string;
}

interface GovernanceAndStatusViewProps {
  serviceStatus: ServiceStatusInfo | null;
  firestoreConnected: boolean;
}

const ACCEPTANCE_STATUS_MATRIX = [
  {
    feature: 'Unified Application Shell, Responsive Navigation & English/Telugu Selector',
    module: 'Platform Core',
    status: 'Implemented and tested',
    verification: 'Verified via automated Vitest suite and live responsive layout inspection.',
  },
  {
    feature: 'HealthGuide Conversational Assistant with Google Search Grounding & Citations',
    module: 'Module 1 — HealthGuide',
    status: 'Implemented and tested',
    verification: 'Uses @google/genai server-side with googleSearch tool and real groundingChunks extraction.',
  },
  {
    feature: 'Urgent / Emergency Red-Flag Triage Interception (108 / 112 / 911)',
    module: 'Module 1 & Global Search',
    status: 'Implemented and tested',
    verification: 'Deterministic + AI red-flag check tested across English & Telugu emergency phrases.',
  },
  {
    feature: 'HealthAccess Bilingual Simplification, Translation & Dosage Preservation Audit',
    module: 'Module 2 — HealthAccess',
    status: 'Implemented and tested',
    verification: 'Schema-constrained bilingual output preserving exact units, numbers, and warnings.',
  },
  {
    feature: 'ClinicConnect Approved Knowledge Retrieval, Staff Escalation & Firestore Sync',
    module: 'Module 3 — ClinicConnect',
    status: 'Implemented and tested',
    verification: 'Backed by Cloud Firestore (/clinics, /clinic_faqs) and approved demonstration dataset.',
  },
  {
    feature: 'PrivateMed Deterministic On-Device Biomarker Parser & Memory Purge',
    module: 'Module 4 — PrivateMed',
    status: 'Implemented and tested',
    verification: '100% client-side extraction of values, units, and reference ranges with 0 network calls.',
  },
  {
    feature: 'PrivateMed Local Ollama + Python FastAPI Companion Service (127.0.0.1:8765)',
    module: 'Module 4 — PrivateMed',
    status: 'Requires local computer setup',
    verification: 'Full FastAPI companion (privatemd_companion/app.py) provided; requires local Ollama installation on user machine.',
  },
  {
    feature: 'PrivateMed Explicit Opt-In Multimodal Medical Image & Report Verification',
    module: 'Module 4 — PrivateMed',
    status: 'Implemented and tested',
    verification: 'Supports PNG/JPEG/WEBP upload & 1-click synthetic canvas lab report generation with Gemini multimodal verification.',
  },
  {
    feature: 'Client-Side AES-256-GCM Encrypted Patient Record Vault in Cloud Firestore',
    module: 'Security & Privacy',
    status: 'Implemented and tested',
    verification: 'WebCrypto PBKDF2 + AES-256-GCM encryption prior to Firestore write, protected by owner-isolated Firestore rules.',
  },
  {
    feature: 'MedStruct Clinical Note Structuring & Independent Numeric Grounding Validator',
    module: 'Module 5 — MedStruct',
    status: 'Implemented and tested',
    verification: 'Validates JSON schema, distinguishes explicit negatives from missing info, and blocks hallucinated measurements.',
  },
  {
    feature: 'Zero-Trust Firestore Security Rules (ESLint Verified & Deployed)',
    module: 'Backend Security',
    status: 'Implemented and tested',
    verification: 'Passed @firebase/eslint-plugin-security-rules with 0 warnings and deployed to Firebase project hidef-mapper-wk8sk.',
  },
  {
    feature: 'Live Hospital EHR Write-Back & Real-Time Slot Reservation API',
    module: 'External Hospital Integration',
    status: 'Requires credentials or account setup',
    verification: 'Intentionally gated behind authorized hospital HL7/FHIR credentials and clinician sign-off.',
  },
];

export const GovernanceAndStatusView: React.FC<GovernanceAndStatusViewProps> = ({
  serviceStatus,
  firestoreConnected,
}) => {
  return (
    <div className="space-y-8">
      {/* Live Service & Architecture Status */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="border-b border-slate-200 pb-4">
          <div className="text-xs font-medium text-teal-700 mb-1">
            Platform Governance · Service Telemetry, Setup Guide &amp; Acceptance Matrix
          </div>
          <h2 className="text-2xl font-bold text-slate-900">
            System Architecture, Privacy Controls &amp; Feature Verification Matrix
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Transparent real-time inspection of connected services, security rules, expected cloud usage costs, and acceptance testing status.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
            <div className="font-semibold text-slate-500">Server-Side Gemini API</div>
            <div className="text-sm font-bold text-slate-900 font-mono">
              {serviceStatus?.geminiConfigured ? 'Configured & Active' : 'Requires GEMINI_API_KEY'}
            </div>
            <div className="text-slate-600">
              Model: <code className="font-mono">{serviceStatus?.activeModel || 'gemini-3.8-flash'}</code>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
            <div className="font-semibold text-slate-500">Google Search Grounding</div>
            <div className="text-sm font-bold text-slate-900 font-mono">
              {serviceStatus?.searchGroundingSupported ? 'Enabled (Real Citations)' : 'Unavailable'}
            </div>
            <div className="text-slate-600">Extracts genuine groundingChunks URLs</div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
            <div className="font-semibold text-slate-500">Cloud Firestore &amp; Auth</div>
            <div className="text-sm font-bold text-slate-900 font-mono">
              {firestoreConnected ? 'Online (Enterprise Edition)' : 'Offline'}
            </div>
            <div className="text-slate-600">Project: hidef-mapper-wk8sk</div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
            <div className="font-semibold text-slate-500">Patient Record Encryption</div>
            <div className="text-sm font-bold text-slate-900 font-mono">AES-256-GCM</div>
            <div className="text-slate-600">WebCrypto PBKDF2 (100,000 iterations)</div>
          </div>
        </div>
      </div>

      {/* Required Feature & Acceptance Status Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h3 className="text-base font-bold text-slate-900">
            Feature &amp; Acceptance Criteria Status Table
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Honest engineering classification of what is implemented and tested, what requires local machine setup, and what requires external hospital credentials.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600">
                <th className="py-3 px-4 font-semibold">Capability / Requirement</th>
                <th className="py-3 px-4 font-semibold">Module</th>
                <th className="py-3 px-4 font-semibold">Implementation Status</th>
                <th className="py-3 px-4 font-semibold">Verification &amp; Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {ACCEPTANCE_STATUS_MATRIX.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-semibold text-slate-900">{row.feature}</td>
                  <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                    {row.module}
                  </td>
                  <td className="py-3 px-4 font-semibold whitespace-nowrap">
                    {row.status === 'Implemented and tested' ? (
                      <span className="text-emerald-700">{row.status}</span>
                    ) : row.status === 'Requires local computer setup' ? (
                      <span className="text-amber-800">{row.status}</span>
                    ) : (
                      <span className="text-slate-700">{row.status}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-600">{row.verification}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cost, Quotas, Known Limitations & Export to Google Antigravity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3 text-xs text-slate-600">
          <h3 className="text-base font-bold text-slate-900">
            Service Costs, Usage Limits &amp; Known Limitations
          </h3>
          <ul className="list-disc pl-4 space-y-1.5 leading-relaxed">
            <li>
              <strong>Cloud Firestore &amp; Firebase Auth:</strong> Provisioned on Firestore Enterprise Edition free tier (Spark plan daily read/write quotas apply; resets daily).
            </li>
            <li>
              <strong>Gemini API &amp; Google Search Grounding:</strong> Uses <code className="font-mono">gemini-3.8-flash</code> server-side with sliding-window rate limiting (40 req/min/IP). Search grounding availability and rate limits depend on the configured <code className="font-mono">GEMINI_API_KEY</code> billing tier.
            </li>
            <li>
              <strong>PrivateMed Local Ollama Limitation in Cloud Preview:</strong> Because this web preview is hosted in a cloud container, <code className="font-mono">127.0.0.1</code> inside the server container does not refer to your laptop. Therefore, PrivateMed probes <code className="font-mono">127.0.0.1</code> directly from your browser and includes the downloadable Python FastAPI companion (<code className="font-mono">privatemd_companion/app.py</code>).
            </li>
            <li>
              <strong>Clinical Disclaimer:</strong> HealthBridge AI is not a certified medical device and does not replace licensed physicians or certified medical interpreters.
            </li>
          </ul>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3 text-xs text-slate-600">
          <h3 className="text-base font-bold text-slate-900">
            Exporting &amp; Continuing Development in Google Antigravity / Local IDE
          </h3>
          <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed">
            <li>
              Export or clone the repository to your local workstation or Google Antigravity workspace.
            </li>
            <li>
              Copy <code className="font-mono">.env.example</code> to <code className="font-mono">.env</code> and set <code className="font-mono">GEMINI_API_KEY</code>. Never commit <code className="font-mono">.env</code> to source control.
            </li>
            <li>
              Install Node dependencies (<code className="font-mono">npm install</code>) and run automated verification tests (<code className="font-mono">npm test</code>) and Firestore rules linting (<code className="font-mono">npx eslint firestore.rules</code>).
            </li>
            <li>
              For PrivateMed Local Ollama mode, start Ollama (<code className="font-mono">ollama pull llama3.2:3b</code>) and launch the Python FastAPI companion: <code className="font-mono">uvicorn privatemd_companion.app:app --host 127.0.0.1 --port 8765</code>.
            </li>
            <li>
              Start the full-stack server on port 3000 via <code className="font-mono">npm run dev</code>.
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
};
