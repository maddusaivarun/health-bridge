import React, { useState, useEffect, useRef } from 'react';
import {
  FileCode2,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Lock,
  Database,
  Bug,
} from 'lucide-react';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  STORAGE_KEYS,
  readLocalStorage,
  writeLocalStorage,
  MedStructCachedState,
} from '../lib/storageCache';
import {
  MedStructOutput,
  SchemaValidationReport,
  scanForPotentialPII,
  validateMedStructOutput,
} from '../shared/clinicalCore';
import { SYNTHETIC_CLINICAL_NOTES } from '../shared/sampleData';
import { apiPostMedStruct } from '../lib/apiClient';

interface MedStructModuleProps {
  currentUser: User | null;
}

interface SavedNoteItem {
  id: string;
  noteTitle: string;
  presentingComplaint: string;
  structuredPayload: string;
  validationStatus: 'VALIDATED' | 'NEEDS_CORRECTION';
  reviewStatus: 'PENDING_REVIEW' | 'APPROVED_FINAL';
}

const MedStructModuleComponent: React.FC<MedStructModuleProps> = ({ currentUser }) => {
  const cachedState = useRef<MedStructCachedState | null>(
    readLocalStorage<MedStructCachedState | null>(STORAGE_KEYS.MEDSTRUCT_STATE, null)
  ).current;

  const [noteTitle, setNoteTitle] = useState(
    () => cachedState?.noteTitle || SYNTHETIC_CLINICAL_NOTES[0].title
  );
  const [clinicalNote, setClinicalNote] = useState(
    () => cachedState?.clinicalNote || SYNTHETIC_CLINICAL_NOTES[0].noteText
  );
  const [deIdentifiedConfirmed, setDeIdentifiedConfirmed] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [structuredOutput, setStructuredOutput] = useState<MedStructOutput | null>(
    () => cachedState?.structuredOutput || null
  );
  const [validationReport, setValidationReport] = useState<SchemaValidationReport | null>(
    () => cachedState?.validationReport || null
  );
  const [matchedIcd10, setMatchedIcd10] = useState<Array<{ code: string; name: string }>>(
    () => cachedState?.matchedIcd10 || []
  );
  const [latencyMs, setLatencyMs] = useState<number | null>(() => cachedState?.latencyMs ?? null);
  const [humanReviewStatus, setHumanReviewStatus] = useState<'PENDING_REVIEW' | 'APPROVED_FINAL'>(
    () => cachedState?.humanReviewStatus || 'PENDING_REVIEW'
  );

  // Saved Clinical Notes in Firestore
  const [savedNotes, setSavedNotes] = useState<SavedNoteItem[]>([]);
  const [firestoreMsg, setFirestoreMsg] = useState<string | null>(null);

  const piiPreScan = scanForPotentialPII(clinicalNote);

  useEffect(() => {
    writeLocalStorage<MedStructCachedState>(STORAGE_KEYS.MEDSTRUCT_STATE, {
      noteTitle,
      clinicalNote,
      structuredOutput,
      validationReport,
      matchedIcd10,
      latencyMs,
      humanReviewStatus,
    });
  }, [
    noteTitle,
    clinicalNote,
    structuredOutput,
    validationReport,
    matchedIcd10,
    latencyMs,
    humanReviewStatus,
  ]);

  useEffect(() => {
    if (!currentUser || !currentUser.emailVerified) {
      setSavedNotes([]);
      return;
    }
    const q = query(collection(db, 'clinical_notes'), where('ownerId', '==', currentUser.uid));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: SavedNoteItem[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            noteTitle: data.noteTitle,
            presentingComplaint: data.presentingComplaint,
            structuredPayload: data.structuredPayload,
            validationStatus: data.validationStatus,
            reviewStatus: data.reviewStatus,
          };
        });
        setSavedNotes(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'clinical_notes');
        } catch {
          // Handled
        }
      }
    );
    return () => unsub();
  }, [currentUser]);

  const handleExtractAndValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicalNote.trim() || loading) return;

    setLoading(true);
    setError(null);
    setHumanReviewStatus('PENDING_REVIEW');

    try {
      const data = await apiPostMedStruct({
        clinicalNote,
        deIdentifiedConfirmed,
      });
      setStructuredOutput(data.structuredData);
      setValidationReport(data.validationReport);
      setMatchedIcd10(data.matchedIcd10Conditions || []);
      setLatencyMs(data.latencyMs || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MedStruct extraction failed.');
    } finally {
      setLoading(false);
    }
  };

  // Interactive QA Check: Test how independent schema validator catches hallucinated measurements or invalid fields
  const handleSimulateValidationFailure = () => {
    const malformedPayload = {
      presentingComplaint: 'Intermittent fever for 5 days',
      symptoms: [
        {
          symptom: 'Fever',
          duration: '5 days',
          severity: 'mild',
          status: 'invalid_status_enum', // Invalid enum
        },
      ],
      relevantHistory: ['Seasonal allergic rhinitis'],
      observationsAndMeasurements: [
        {
          metric: 'Heart Rate',
          value: '199', // Hallucinated number not in source text!
          unit: 'bpm',
          verbatimQuote: 'HR 199 bpm',
        },
      ],
      assessment: null,
      plan: ['Supportive hydration'],
      missingInformation: ['Drug allergy status'],
      ambiguousStatements: [],
    };

    const report = validateMedStructOutput(malformedPayload, clinicalNote);
    setStructuredOutput(malformedPayload as unknown as MedStructOutput);
    setValidationReport(report);
    setHumanReviewStatus('PENDING_REVIEW');
  };

  const handleSaveToFirestore = async () => {
    if (!currentUser || !currentUser.emailVerified || !structuredOutput || !validationReport) {
      setFirestoreMsg('Sign in with a verified Google account and run extraction first.');
      return;
    }

    const noteId = `note-${Date.now()}`;
    setFirestoreMsg(null);

    try {
      await setDoc(doc(db, 'clinical_notes', noteId), {
        ownerId: currentUser.uid,
        noteTitle: noteTitle.trim().slice(0, 160),
        presentingComplaint: structuredOutput.presentingComplaint.slice(0, 500),
        structuredPayload: JSON.stringify(structuredOutput).slice(0, 25000),
        validationStatus: validationReport.isValid ? 'VALIDATED' : 'NEEDS_CORRECTION',
        reviewStatus: humanReviewStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setFirestoreMsg(`Saved structured clinical note (${noteId}) to Firestore.`);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, `clinical_notes/${noteId}`);
      } catch (formatted) {
        setFirestoreMsg(formatted instanceof Error ? formatted.message : 'Save failed.');
      }
    }
  };

  const handleLockFinalApproval = async (note: SavedNoteItem) => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, 'clinical_notes', note.id), {
        noteTitle: note.noteTitle,
        presentingComplaint: note.presentingComplaint,
        structuredPayload: note.structuredPayload,
        validationStatus: note.validationStatus,
        reviewStatus: 'APPROVED_FINAL',
        updatedAt: serverTimestamp(),
      });
      setFirestoreMsg(
        `Note ${note.id} locked as APPROVED_FINAL. Firestore Security Rules now block any subsequent edits (Terminal State Locking).`
      );
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.UPDATE, `clinical_notes/${note.id}`);
      } catch (formatted) {
        setFirestoreMsg(formatted instanceof Error ? formatted.message : 'Update failed.');
      }
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteDoc(doc(db, 'clinical_notes', noteId));
      setFirestoreMsg(`Deleted structured clinical note ${noteId}.`);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.DELETE, `clinical_notes/${noteId}`);
      } catch (formatted) {
        setFirestoreMsg(formatted instanceof Error ? formatted.message : 'Delete failed.');
      }
    }
  };

  return (
    <div className="space-y-8">
      {/* Module Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="text-xs font-medium text-teal-700 mb-1">
              05. MedStruct · Clinical Note Structuring, Schema Validation &amp; Live ICD-10-CM Coding
            </div>
            <h2 className="text-2xl font-bold text-slate-900">
              Validated Clinical Documentation Assistant
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              Transforms de-identified clinical notes into schema-validated JSON, cross-references live NIH NLM ICD-10-CM diagnostic codes, distinguishes absent information from documented negative findings, and verifies every numeric measurement against the source note.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {SYNTHETIC_CLINICAL_NOTES.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setNoteTitle(item.title);
                  setClinicalNote(item.noteText);
                  setError(null);
                }}
                className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap"
              >
                Clinical Note #{idx + 1}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            <strong>Safety Policy:</strong> Never automatically writes to live hospital EHRs. All structured outputs require human clinician review and sign-off.
          </span>
          <button
            type="button"
            onClick={handleSimulateValidationFailure}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 hover:text-amber-950"
          >
            <Bug className="w-3.5 h-3.5" />
            <span>Test Schema &amp; Hallucination Validator with Malformed Payload</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Free-Text Clinical Note Input & PII Pre-Flight Scanner */}
        <form
          onSubmit={handleExtractAndValidate}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Encounter / Note Reference Title
            </label>
            <input
              type="text"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              className="w-full px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="medstruct-note-input" className="block text-xs font-semibold text-slate-700 mb-1">
              De-Identified Clinical Note Free Text
            </label>
            <textarea
              id="medstruct-note-input"
              rows={12}
              value={clinicalNote}
              onChange={(e) => setClinicalNote(e.target.value)}
              className="w-full p-3 text-xs font-mono text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          {/* Deterministic Pre-Flight PII Scanner */}
          {piiPreScan.hasPII ? (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg space-y-2 text-xs text-amber-900">
              <div className="font-bold flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-700" />
                <span>Potential Identifiers Detected in Input:</span>
              </div>
              <ul className="list-disc pl-4 space-y-0.5">
                {piiPreScan.findings.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setClinicalNote(piiPreScan.redactedText)}
                className="px-3 py-1.5 text-xs font-semibold bg-amber-900 text-white rounded hover:bg-amber-800"
              >
                Auto-Redact Detected Identifiers Now
              </button>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
              <span>Pre-Flight De-Identification Check: No phone, email, Aadhaar, or MRN patterns found.</span>
            </div>
          )}

          <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={deIdentifiedConfirmed}
              onChange={(e) => setDeIdentifiedConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
            />
            <span>
              I confirm this note is synthetic or appropriately de-identified and authorized for structured extraction.
            </span>
          </label>

          <button
            type="submit"
            disabled={loading || !deIdentifiedConfirmed || clinicalNote.trim().length < 10}
            className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors"
          >
            {loading
              ? 'Extracting & Validating Against Schema...'
              : 'Transform to Structured JSON & Validate'}
          </button>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
              {error}
            </div>
          )}
        </form>

        {/* Right: Structured Output, Schema Validation Report & Clinician Review */}
        <div className="lg:col-span-7 space-y-6">
          {!structuredOutput && !loading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
              <FileCode2 className="w-8 h-8 text-teal-700 mx-auto" />
              <h3 className="text-base font-semibold text-slate-900">
                Ready to Structure &amp; Validate Clinical Documentation
              </h3>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                Click &ldquo;Transform to Structured JSON &amp; Validate&rdquo; on the left to inspect the extracted clinical entities, explicit negative findings, missing data flags, and independent schema validation report.
              </p>
            </div>
          ) : loading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 animate-pulse">
              <div className="h-5 bg-slate-200 rounded w-1/3" />
              <div className="h-28 bg-slate-100 rounded w-full" />
              <div className="h-28 bg-slate-100 rounded w-full" />
            </div>
          ) : (
            structuredOutput &&
            validationReport && (
              <div className="space-y-6">
                {/* Schema & Grounding Validation Status Card */}
                <div
                  className={`rounded-xl border p-5 space-y-3 ${
                    validationReport.isValid
                      ? 'bg-white border-slate-200'
                      : 'bg-red-50 border-red-300'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {validationReport.isValid ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-red-700" />
                      )}
                      <h3 className="text-base font-bold text-slate-900">
                        Independent Schema &amp; Numeric Grounding Validation:{' '}
                        {validationReport.isValid ? 'PASSED' : 'FAILED (NEEDS CORRECTION)'}
                      </h3>
                    </div>
                    <span className="text-xs font-mono text-slate-600">
                      Review Status: {humanReviewStatus}
                    </span>
                  </div>

                  {validationReport.errors.length > 0 && (
                    <div className="p-3 bg-white border border-red-200 rounded-lg text-xs text-red-900 space-y-1">
                      <div className="font-bold">Validation &amp; Grounding Errors Caught:</div>
                      <ul className="list-disc pl-4 space-y-0.5 font-mono">
                        {validationReport.errors.map((errItem, idx) => (
                          <li key={idx}>{errItem}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setHumanReviewStatus((s) =>
                            s === 'PENDING_REVIEW' ? 'APPROVED_FINAL' : 'PENDING_REVIEW'
                          )
                        }
                        disabled={!validationReport.isValid}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 disabled:opacity-50"
                      >
                        {humanReviewStatus === 'APPROVED_FINAL'
                          ? 'Re-open for Review'
                          : 'Mark Clinician Reviewed (APPROVED_FINAL)'}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveToFirestore}
                      disabled={!currentUser}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
                    >
                      <Database className="w-3.5 h-3.5" />
                      <span>
                        {currentUser
                          ? 'Save Validated Note to Firestore'
                          : 'Sign In to Save to Firestore'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Structured Clinical Entities Breakdown */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-mono text-teal-700 font-semibold">
                        PRESENTING COMPLAINT
                      </div>
                      <p className="text-sm font-semibold text-slate-900 mt-1">
                        {structuredOutput.presentingComplaint}
                      </p>
                    </div>
                    {latencyMs && (
                      <span className="text-xs font-mono text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded">
                        Processed in {latencyMs}ms
                      </span>
                    )}
                  </div>

                  {matchedIcd10.length > 0 && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                      <div className="text-xs font-mono font-bold text-teal-700">
                        LIVE NIH NLM ICD-10-CM DIAGNOSTIC CODE MATCHES
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {matchedIcd10.map((c, idx) => (
                          <span
                            key={idx}
                            className="text-xs bg-white border border-slate-200 rounded px-2.5 py-1 font-mono text-slate-800"
                          >
                            <strong className="text-teal-700">{c.code}</strong> — {c.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Symptoms: Present vs Explicitly Negative */}
                  <div className="pt-4 border-t border-slate-200 space-y-2">
                    <div className="text-xs font-bold text-slate-900">
                      Symptoms (Present Findings vs. Explicit Negative Findings)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {structuredOutput.symptoms.map((s, i) => (
                        <div
                          key={i}
                          className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between font-semibold text-slate-900">
                            <span>{s.symptom}</span>
                            <span
                              className={`font-mono ${
                                s.status === 'explicitly_negative'
                                  ? 'text-slate-600'
                                  : 'text-teal-800'
                              }`}
                            >
                              {s.status}
                            </span>
                          </div>
                          <div className="text-slate-500">
                            Duration: {s.duration} · Severity: {s.severity}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Observations & Measurements */}
                  <div className="pt-4 border-t border-slate-200 space-y-2">
                    <div className="text-xs font-bold text-slate-900">
                      Observations &amp; Measurements (Verified Against Source Text)
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            <th className="py-2 pr-3 font-semibold">Metric</th>
                            <th className="py-2 px-3 font-semibold text-right">Value</th>
                            <th className="py-2 px-3 font-semibold">Unit</th>
                            <th className="py-2 pl-3 font-semibold">Verbatim Source Quote</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
                          {structuredOutput.observationsAndMeasurements.map((m, i) => (
                            <tr key={i}>
                              <td className="py-2 pr-3 font-sans font-medium text-slate-900">
                                {m.metric}
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-slate-900">
                                {m.value}
                              </td>
                              <td className="py-2 px-3 text-slate-600">{m.unit}</td>
                              <td className="py-2 pl-3 text-slate-500">&ldquo;{m.verbatimQuote}&rdquo;</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Missing Info & Ambiguous Statements */}
                  <div className="pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg space-y-1.5 text-xs">
                      <div className="font-bold text-amber-950">
                        Missing Information (Absent from Note):
                      </div>
                      <ul className="list-disc pl-4 space-y-1 text-amber-900">
                        {structuredOutput.missingInformation.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs">
                      <div className="font-bold text-slate-900">
                        Ambiguous Statements Flagged for Review:
                      </div>
                      <ul className="list-disc pl-4 space-y-1 text-slate-700">
                        {structuredOutput.ambiguousStatements.map((a, i) => (
                          <li key={i}>
                            <strong>{a.statement}:</strong> {a.reasonForReview}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Raw Validated JSON Schema Output */}
                  <div className="pt-4 border-t border-slate-200 space-y-2">
                    <div className="text-xs font-mono font-semibold text-slate-700">
                      SCHEMA-CONSTRAINED JSON OUTPUT
                    </div>
                    <pre className="p-4 bg-slate-900 text-teal-300 rounded-lg font-mono text-xs overflow-x-auto max-h-72">
                      {JSON.stringify(structuredOutput, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )
          )}

          {/* Firestore Saved Notes with Terminal State Locking */}
          {firestoreMsg && (
            <div className="p-3 bg-slate-900 text-teal-300 rounded-lg text-xs font-mono">
              {firestoreMsg}
            </div>
          )}

          {savedNotes.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="text-sm font-bold text-slate-900">
                Your Saved Clinical Notes in Firestore ({savedNotes.length})
              </div>
              <div className="divide-y divide-slate-200">
                {savedNotes.map((n) => (
                  <div key={n.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-semibold text-slate-900">{n.noteTitle}</div>
                      <div className="text-slate-500 font-mono">
                        {n.validationStatus} · {n.reviewStatus}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {n.reviewStatus !== 'APPROVED_FINAL' ? (
                        <button
                          type="button"
                          onClick={() => handleLockFinalApproval(n)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded hover:bg-teal-100"
                        >
                          <Lock className="w-3 h-3" />
                          <span>Sign Off &amp; Lock</span>
                        </button>
                      ) : (
                        <span className="font-mono text-slate-500">Locked (Terminal State)</span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteNote(n.id)}
                        className="px-2.5 py-1 font-semibold text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const MedStructModule = React.memo(MedStructModuleComponent);
