import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  Clock,
  MapPin,
  ExternalLink,
  AlertTriangle,
  Plus,
  Database,
  UserCheck,
  HelpCircle,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  query,
  where,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  STORAGE_KEYS,
  readLocalStorage,
  writeLocalStorage,
  ClinicConnectCachedState,
} from '../lib/storageCache';
import {
  SAMPLE_APPROVED_CLINIC,
  SAMPLE_APPROVED_DOCTORS,
  SAMPLE_APPROVED_FAQS,
  ApprovedClinicProfile,
  ApprovedClinicFaqItem,
} from '../shared/sampleData';

interface ClinicConnectModuleProps {
  language: 'en' | 'te';
  currentUser: User | null;
}

interface ClinicQaResponse {
  answer: string;
  matchedRecordIds: string[];
  requiresStaffEscalation: boolean;
  escalationReason: string;
  publishedVsRealtimeNotice: string;
}

const ClinicConnectModuleComponent: React.FC<ClinicConnectModuleProps> = ({
  language,
  currentUser,
}) => {
  const cachedState = useRef<ClinicConnectCachedState | null>(
    readLocalStorage<ClinicConnectCachedState | null>(STORAGE_KEYS.CLINICCONNECT_STATE, null)
  ).current;

  const [clinicProfile, setClinicProfile] = useState<ApprovedClinicProfile>(SAMPLE_APPROVED_CLINIC);
  const [faqs, setFaqs] = useState<ApprovedClinicFaqItem[]>(SAMPLE_APPROVED_FAQS);
  const [firestoreSynced, setFirestoreSynced] = useState(false);

  const [question, setQuestion] = useState(() => cachedState?.question || '');
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);
  const [qaResult, setQaResult] = useState<ClinicQaResponse | null>(
    () => cachedState?.qaResult || null
  );

  useEffect(() => {
    writeLocalStorage<ClinicConnectCachedState>(STORAGE_KEYS.CLINICCONNECT_STATE, {
      question,
      qaResult,
    });
  }, [question, qaResult]);

  // Authorized Staff Update Form State
  const [showStaffEditor, setShowStaffEditor] = useState(false);
  const [newFaqCategory, setNewFaqCategory] = useState<ApprovedClinicFaqItem['category']>('general');
  const [newFaqQuestion, setNewFaqQuestion] = useState('');
  const [newFaqAnswer, setNewFaqAnswer] = useState('');
  const [newFaqQuestionTe, setNewFaqQuestionTe] = useState('');
  const [newFaqAnswerTe, setNewFaqAnswerTe] = useState('');
  const [staffStatusMsg, setStaffStatusMsg] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const isAuthorizedAdmin =
    Boolean(currentUser?.emailVerified) && currentUser?.email === 'madduvarun5@gmail.com';

  // Subscribe to public approved clinic data in Firestore
  useEffect(() => {
    const clinicsQuery = query(collection(db, 'clinics'), where('visibility', '==', 'public'));
    const unsubClinics = onSnapshot(
      clinicsQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          const docData = snapshot.docs[0].data();
          setClinicProfile({
            id: snapshot.docs[0].id,
            name: docData.name,
            address: docData.address,
            phone: docData.phone,
            emergencyPhone: docData.emergencyPhone,
            hours: docData.hours,
            bookingUrl: docData.bookingUrl,
            departments: docData.departments,
            doctorsSummary: docData.doctorsSummary,
            appointmentInstructions: docData.appointmentInstructions,
            visibility: 'public',
            isSampleDataset: Boolean(docData.isSampleDataset),
          });
          setFirestoreSynced(true);
        }
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'clinics');
        } catch {
          // Keep synthetic fallback active if rules/network block
        }
      }
    );

    const faqsQuery = query(collection(db, 'clinic_faqs'), where('visibility', '==', 'public'));
    const unsubFaqs = onSnapshot(
      faqsQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          const loadedFaqs: ApprovedClinicFaqItem[] = snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              clinicId: data.clinicId,
              category: data.category,
              question: data.question,
              answer: data.answer,
              questionTe: data.questionTe,
              answerTe: data.answerTe,
              visibility: 'public',
            };
          });
          setFaqs(loadedFaqs);
          setFirestoreSynced(true);
        }
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'clinic_faqs');
        } catch {
          // Keep synthetic fallback active
        }
      }
    );

    return () => {
      unsubClinics();
      unsubFaqs();
    };
  }, []);

  const handleAskClinicQuestion = async (customQ?: string) => {
    const activeQ = (customQ ?? question).trim();
    if (!activeQ || qaLoading) return;

    setQaLoading(true);
    setQaError(null);

    try {
      const res = await fetch('/api/clinic-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: activeQ,
          language,
          clinicProfile,
          faqs,
          doctors: SAMPLE_APPROVED_DOCTORS,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Unable to retrieve clinic response.');
      }
      setQaResult(data);
    } catch (err) {
      setQaError(err instanceof Error ? err.message : 'ClinicConnect service error.');
    } finally {
      setQaLoading(false);
    }
  };

  const handleSeedApprovedDatasetToFirestore = async () => {
    if (!currentUser || !isAuthorizedAdmin) return;
    setSeeding(true);
    setStaffStatusMsg(null);

    try {
      const clinicId = SAMPLE_APPROVED_CLINIC.id;
      await setDoc(doc(db, 'clinics', clinicId), {
        name: SAMPLE_APPROVED_CLINIC.name.slice(0, 120),
        address: SAMPLE_APPROVED_CLINIC.address.slice(0, 300),
        phone: SAMPLE_APPROVED_CLINIC.phone.slice(0, 40),
        emergencyPhone: SAMPLE_APPROVED_CLINIC.emergencyPhone.slice(0, 40),
        hours: SAMPLE_APPROVED_CLINIC.hours.slice(0, 200),
        bookingUrl: SAMPLE_APPROVED_CLINIC.bookingUrl.slice(0, 300),
        departments: SAMPLE_APPROVED_CLINIC.departments.slice(0, 500),
        doctorsSummary: SAMPLE_APPROVED_CLINIC.doctorsSummary.slice(0, 1000),
        appointmentInstructions: SAMPLE_APPROVED_CLINIC.appointmentInstructions.slice(0, 800),
        visibility: 'public',
        isSampleDataset: true,
        authorId: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      for (const item of SAMPLE_APPROVED_FAQS) {
        await setDoc(doc(db, 'clinic_faqs', item.id), {
          clinicId,
          category: item.category,
          question: item.question.slice(0, 300),
          answer: item.answer.slice(0, 1500),
          questionTe: item.questionTe.slice(0, 500),
          answerTe: item.answerTe.slice(0, 2000),
          visibility: 'public',
          authorId: currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setStaffStatusMsg('Approved demonstration clinic profile and FAQs published to Cloud Firestore.');
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, 'clinics');
      } catch (formattedErr) {
        setStaffStatusMsg(
          formattedErr instanceof Error ? formattedErr.message : 'Firestore write error.'
        );
      }
    } finally {
      setSeeding(false);
    }
  };

  const handleCreateApprovedFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !isAuthorizedAdmin) return;
    if (newFaqQuestion.trim().length < 5 || newFaqAnswer.trim().length < 5) return;

    setStaffStatusMsg(null);
    const faqId = `faq-${Date.now()}`;

    try {
      await setDoc(doc(db, 'clinic_faqs', faqId), {
        clinicId: clinicProfile.id,
        category: newFaqCategory,
        question: newFaqQuestion.trim().slice(0, 300),
        answer: newFaqAnswer.trim().slice(0, 1500),
        questionTe: (newFaqQuestionTe.trim() || newFaqQuestion.trim()).slice(0, 500),
        answerTe: (newFaqAnswerTe.trim() || newFaqAnswer.trim()).slice(0, 2000),
        visibility: 'public',
        authorId: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setNewFaqQuestion('');
      setNewFaqAnswer('');
      setNewFaqQuestionTe('');
      setNewFaqAnswerTe('');
      setStaffStatusMsg(`New approved FAQ (${faqId}) saved to Cloud Firestore.`);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, `clinic_faqs/${faqId}`);
      } catch (formattedErr) {
        setStaffStatusMsg(
          formattedErr instanceof Error ? formattedErr.message : 'Failed to create FAQ.'
        );
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
              03. ClinicConnect · Approved Clinic Knowledge Base &amp; Staff Escalation
            </div>
            <h2 className="text-2xl font-bold text-slate-900">{clinicProfile.name}</h2>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              Answers clinic inquiries strictly from approved records stored in Cloud Firestore. Never invents doctors, consultation fees, or real-time appointment confirmations.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <span className="text-xs font-mono text-slate-600">
              {firestoreSynced ? 'Source: Cloud Firestore Live' : 'Source: Approved Clinic Knowledge Base'}
            </span>
            <button
              type="button"
              onClick={() => setShowStaffEditor((prev) => !prev)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              {showStaffEditor ? 'Close Staff Portal' : 'Authorized Staff Update Portal'}
            </button>
          </div>
        </div>

        <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs text-slate-700">
          <div className="flex items-start gap-2.5">
            <MapPin className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-slate-900">Published Address</div>
              <div>{clinicProfile.address}</div>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-slate-900">Published Operating Hours</div>
              <div>{clinicProfile.hours}</div>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Phone className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-slate-900">Reception &amp; Emergency Escalation</div>
              <div className="font-mono">{clinicProfile.phone}</div>
              <div className="text-red-700 font-medium mt-0.5">{clinicProfile.emergencyPhone}</div>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <ExternalLink className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-slate-900">Online Token Registration</div>
              <a
                href={
                  clinicProfile.bookingUrl.startsWith('http')
                    ? clinicProfile.bookingUrl.split(' ')[0]
                    : `https://${clinicProfile.bookingUrl.split(' ')[0]}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-700 hover:text-teal-800 font-medium underline inline-flex items-center gap-1"
                title={`Visit ${clinicProfile.bookingUrl}`}
              >
                <span>{clinicProfile.bookingUrl.split(' ')[0]}</span>
                <span className="text-[10px]">↗</span>
              </a>
              <div className="text-slate-500 text-[11px] mt-0.5">National Online Registration</div>
            </div>
          </div>
        </div>
      </div>

      {/* Authorized Staff Portal (Firestore Write Integration) */}
      {showStaffEditor && (
        <div className="bg-slate-900 text-white rounded-xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <div className="text-xs font-mono text-teal-400">
                FIRESTORE RBAC GOVERNANCE · ADMIN STAFF PORTAL
              </div>
              <h3 className="text-lg font-bold mt-0.5">
                Authorized Clinic Knowledge Base Management
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Firestore Security Rules strictly restrict writes on <code className="font-mono">/clinics</code> and <code className="font-mono">/clinic_faqs</code> to verified clinic administrators.
              </p>
            </div>
            {isAuthorizedAdmin && (
              <button
                type="button"
                onClick={handleSeedApprovedDatasetToFirestore}
                disabled={seeding}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-500 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Database className="w-3.5 h-3.5" />
                <span>{seeding ? 'Syncing to Firestore...' : 'Publish Demo Clinic Dataset to Firestore'}</span>
              </button>
            )}
          </div>

          {!currentUser ? (
            <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300">
              Please sign in with Google in the top bar to access authorized staff write operations.
            </div>
          ) : !isAuthorizedAdmin ? (
            <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300">
              Signed in as <span className="font-mono text-white">{currentUser.email}</span> (Read-Only Role). Only verified clinic administrators can modify published clinic records.
            </div>
          ) : (
            <form onSubmit={handleCreateApprovedFaq} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    FAQ Category
                  </label>
                  <select
                    value={newFaqCategory}
                    onChange={(e) => setNewFaqCategory(e.target.value as ApprovedClinicFaqItem['category'])}
                    className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white"
                  >
                    <option value="general">general</option>
                    <option value="hours">hours</option>
                    <option value="departments">departments</option>
                    <option value="appointments">appointments</option>
                    <option value="billing">billing</option>
                    <option value="emergency">emergency</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Approved Question (English, 5–300 chars)
                  </label>
                  <input
                    type="text"
                    required
                    minLength={5}
                    maxLength={300}
                    value={newFaqQuestion}
                    onChange={(e) => setNewFaqQuestion(e.target.value)}
                    placeholder="e.g., Are evening pediatric vaccination slots available on Thursdays?"
                    className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Approved Answer (English, 5–1500 chars)
                  </label>
                  <textarea
                    rows={3}
                    required
                    minLength={5}
                    maxLength={1500}
                    value={newFaqAnswer}
                    onChange={(e) => setNewFaqAnswer(e.target.value)}
                    placeholder="Enter verified clinic policy..."
                    className="w-full p-2.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Approved Answer in Telugu (తెలుగు — Optional)
                  </label>
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={newFaqAnswerTe}
                    onChange={(e) => setNewFaqAnswerTe(e.target.value)}
                    placeholder="తెలుగులో ఆమోదించబడిన సమాధానం..."
                    className="w-full p-2.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-slate-400">
                  Note: Ensure <code className="font-mono">Publish Demo Clinic Dataset to Firestore</code> has been clicked once first so the parent clinic document exists.
                </span>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-white text-slate-900 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Approved FAQ to Firestore</span>
                </button>
              </div>
            </form>
          )}

          {staffStatusMsg && (
            <div className="p-3 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-teal-300">
              {staffStatusMsg}
            </div>
          )}
        </div>
      )}

      {/* Main 2-Column Workspace: Q&A Assistant (Left 6 cols) + Approved Doctor Roster & FAQs (Right 6 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Retrieval-Grounded Clinic Assistant */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              Ask ClinicConnect (Approved Record Retrieval)
            </h3>
            <p className="text-xs text-slate-600">
              Test how ClinicConnect answers questions using approved records and escalates unknown or live-booking requests to staff.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAskClinicQuestion();
              }}
              className="space-y-3"
            >
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={
                  language === 'te'
                    ? 'ఉదా: కార్డియాలజీ డాక్టర్ ఫీజు ఎంత? లేదా ఆదివారం డాక్టర్ ఉంటారా?'
                    : 'e.g., What is the Cardiology fee and hours? Or: Can you book me a 3 PM slot today?'
                }
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <button
                type="submit"
                disabled={qaLoading || question.trim().length < 2}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors"
              >
                {qaLoading ? 'Checking Approved Clinic Records...' : 'Query Approved Clinic Records'}
              </button>
            </form>

            {/* Quick Verification Prompts */}
            <div className="space-y-1.5 pt-2">
              <div className="text-xs font-semibold text-slate-500">
                Sample Queries (Approved Info vs. Staff Escalation Test):
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  'Who is the cardiologist, what are their consultation hours, and what is the fee?',
                  'How do I prepare for a fasting blood sugar and lipid test at the clinic?',
                  'Can you confirm a guaranteed 4:15 PM slot for me today and apply a 50% insurance waiver?',
                ].map((sample, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setQuestion(sample);
                      handleAskClinicQuestion(sample);
                    }}
                    className="text-left text-xs text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>

            {qaError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                {qaError}
              </div>
            )}

            {qaResult && (
              <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-semibold text-teal-700">CLINICCONNECT RESPONSE</span>
                    <span className="font-mono">
                      Matched Records: {qaResult.matchedRecordIds.join(', ') || 'None'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-900 whitespace-pre-line leading-relaxed">
                    {qaResult.answer}
                  </p>
                </div>

                {qaResult.requiresStaffEscalation && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>Escalation to Authorized Clinic Staff Required</span>
                    </div>
                    <p className="text-xs text-amber-900">{qaResult.escalationReason}</p>
                    <div className="pt-1 flex flex-wrap items-center gap-4 text-xs font-mono text-slate-800">
                      <span>Reception Desk: {clinicProfile.phone}</span>
                      <span>Walk-In Registration: 07:45 AM IST</span>
                    </div>
                  </div>
                )}

                <div className="text-xs text-slate-500">{qaResult.publishedVsRealtimeNotice}</div>
              </div>
            )}
          </div>

          {/* Appointment Instructions & Official Booking Notice */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              Published Appointment Instructions &amp; Booking Distinction
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {clinicProfile.appointmentInstructions}
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs border-t border-slate-200">
              <span className="text-slate-500">Official External Booking Reference:</span>
              <a
                href="https://ors.gov.in"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:text-teal-800"
              >
                <span>ORS Patient Portal (ors.gov.in)</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Right: Approved Doctor Profiles & Bilingual FAQ Directory */}
        <div className="lg:col-span-6 space-y-6">
          {/* Approved Doctors Roster */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Approved Doctor Roster (Supplied by Clinic Staff)
                </h3>
                <p className="text-xs text-slate-500">
                  Synthetic Demonstration Profiles — Never fabricated during chat
                </p>
              </div>
              <UserCheck className="w-4 h-4 text-teal-700" />
            </div>
            <div className="divide-y divide-slate-200">
              {SAMPLE_APPROVED_DOCTORS.map((docItem) => (
                <div key={docItem.id} className="p-4 flex items-start gap-4">
                  {/* Resilient Custom SVG Monogram Avatar (Zero-Broken-Image Policy) */}
                  <div
                    className="w-11 h-11 rounded-lg bg-slate-900 text-white flex items-center justify-center font-display font-bold text-sm shrink-0"
                    aria-hidden="true"
                  >
                    {docItem.name
                      .replace('Dr. ', '')
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900">
                        {language === 'te' ? `${docItem.nameTe} (${docItem.name})` : docItem.name}
                      </h4>
                      <span className="text-xs font-mono font-semibold text-teal-700 tabular-nums">
                        {docItem.consultationFeeInr}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      {docItem.qualification} ·{' '}
                      {language === 'te' ? docItem.departmentTe : docItem.department}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-1">
                      Published Schedule: {docItem.consultationHours} · Languages:{' '}
                      {docItem.languages.join(', ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Approved Bilingual FAQs */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Approved Clinic FAQs ({faqs.length})
              </h3>
              <HelpCircle className="w-4 h-4 text-slate-400" />
            </div>
            <div className="divide-y divide-slate-200 max-h-96 overflow-y-auto">
              {faqs.map((faq) => (
                <div key={faq.id} className="p-4 space-y-1.5">
                  <div className="text-xs font-mono text-teal-700">
                    {faq.id} · Category: {faq.category}
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900">
                    {language === 'te' ? faq.questionTe : faq.question}
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {language === 'te' ? faq.answerTe : faq.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ClinicConnectModule = React.memo(ClinicConnectModuleComponent);
