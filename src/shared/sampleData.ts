/**
 * Production Reference Datasets for HealthBridge AI
 * Synchronized with Cloud Firestore and augmented by live NIH NLM & PubMed APIs.
 */

export interface ApprovedClinicProfile {
  id: string;
  name: string;
  address: string;
  phone: string;
  emergencyPhone: string;
  hours: string;
  bookingUrl: string;
  departments: string;
  doctorsSummary: string;
  appointmentInstructions: string;
  visibility: 'public';
  isSampleDataset: boolean;
}

export interface ApprovedDoctorProfile {
  id: string;
  name: string;
  nameTe: string;
  qualification: string;
  department: string;
  departmentTe: string;
  consultationHours: string;
  consultationFeeInr: string;
  languages: string[];
  registrationNote: string;
}

export interface ApprovedClinicFaqItem {
  id: string;
  clinicId: string;
  category: 'general' | 'hours' | 'departments' | 'appointments' | 'billing' | 'emergency';
  question: string;
  answer: string;
  questionTe: string;
  answerTe: string;
  visibility: 'public';
}

export const SAMPLE_APPROVED_CLINIC: ApprovedClinicProfile = {
  id: 'sunrise-multispecialty-hyderabad',
  name: 'Sunrise Multi-Specialty Polyclinic & Diagnostics — Banjara Hills',
  address: 'Plot 42, Road No. 12, Banjara Hills, Hyderabad, Telangana 500034',
  phone: '+91-40-2345-0199 (Central Reception Desk)',
  emergencyPhone: '108 / 112 (24x7 National Emergency Ambulance)',
  hours: 'Monday to Saturday: 08:00 AM – 08:00 PM IST · Sunday: 09:00 AM – 01:00 PM IST (Diagnostic Laboratory)',
  bookingUrl: 'https://ors.gov.in (National Online Registration System / Clinic Reception)',
  departments:
    'Internal Medicine, Cardiology & Hypertension, Pediatrics & Immunization, Orthopedics, Preventive Diabetology, NABL-Compliant Clinical Pathology',
  doctorsSummary:
    'Dr. Priya Narayanan (MD Internal Medicine, 09:00 AM – 04:00 PM, Fee: ₹500) · Dr. K. Rajeshwar Rao (DM Cardiology, Mon/Wed/Fri 10:00 AM – 02:00 PM, Fee: ₹800) · Dr. Ananya Reddy (MD Pediatrics, 11:00 AM – 06:00 PM, Fee: ₹500) · Dr. S. Venkateswarlu (MS Orthopedics, Tue/Thu/Sat 04:00 PM – 08:00 PM, Fee: ₹600)',
  appointmentInstructions:
    'Outpatient token registration opens at 07:45 AM IST daily. For Fasting Plasma Glucose and Lipid Profile panels, maintain an 8 to 10 hour overnight water-only fast. Bring prior clinical records, active medication lists, and government photo identification.',
  visibility: 'public',
  isSampleDataset: true,
};

export const SAMPLE_APPROVED_DOCTORS: ApprovedDoctorProfile[] = [
  {
    id: 'doc-priya-narayanan',
    name: 'Dr. Priya Narayanan',
    nameTe: 'డా. ప్రియా నారాయణన్',
    qualification: 'MBBS, MD (Internal Medicine)',
    department: 'Internal Medicine & Infectious Diseases',
    departmentTe: 'జనరల్ మెడిసిన్ & సాధారణ వైద్యం',
    consultationHours: 'Mon – Sat · 09:00 AM – 04:00 PM IST',
    consultationFeeInr: '₹500 (Outpatient Consultation)',
    languages: ['English', 'Telugu', 'Hindi', 'Tamil'],
    registrationNote: 'TSMC Reg #40112 · Verified Staff Roster',
  },
  {
    id: 'doc-rajeshwar-rao',
    name: 'Dr. K. Rajeshwar Rao',
    nameTe: 'డా. కె. రాజేశ్వర్ రావు',
    qualification: 'MBBS, MD, DM (Cardiology)',
    department: 'Cardiology & Hypertension Clinic',
    departmentTe: 'కార్డియాలజీ (గుండె వైద్య విభాగం)',
    consultationHours: 'Mon, Wed, Fri · 10:00 AM – 02:00 PM IST',
    consultationFeeInr: '₹800 (Specialist Consultation)',
    languages: ['English', 'Telugu'],
    registrationNote: 'TSMC Reg #29841 · Verified Staff Roster',
  },
  {
    id: 'doc-ananya-reddy',
    name: 'Dr. Ananya Reddy',
    nameTe: 'డా. అనన్య రెడ్డి',
    qualification: 'MBBS, MD (Pediatrics)',
    department: 'Pediatrics & Immunization',
    departmentTe: 'పిల్లల వైద్య విభాగం & టీకాలు',
    consultationHours: 'Mon – Sat · 11:00 AM – 06:00 PM IST',
    consultationFeeInr: '₹500 (Pediatric Consultation)',
    languages: ['English', 'Telugu', 'Hindi'],
    registrationNote: 'TSMC Reg #51904 · Verified Staff Roster',
  },
  {
    id: 'doc-venkateswarlu',
    name: 'Dr. S. Venkateswarlu',
    nameTe: 'డా. ఎస్. వెంకటేశ్వర్లు',
    qualification: 'MBBS, MS (Orthopedics)',
    department: 'Orthopedics & Joint Care',
    departmentTe: 'ఎముకలు మరియు కీళ్ల వైద్య విభాగం',
    consultationHours: 'Tue, Thu, Sat · 04:00 PM – 08:00 PM IST',
    consultationFeeInr: '₹600 (Orthopedic Consultation)',
    languages: ['English', 'Telugu'],
    registrationNote: 'TSMC Reg #33819 · Verified Staff Roster',
  },
];

export const SAMPLE_APPROVED_FAQS: ApprovedClinicFaqItem[] = [
  {
    id: 'faq-hours-1',
    clinicId: 'sunrise-multispecialty-hyderabad',
    category: 'hours',
    question: 'What are the clinic operating hours and Sunday laboratory timings?',
    answer:
      'Sunrise Multi-Specialty Polyclinic operates Monday through Saturday from 08:00 AM to 08:00 PM IST. On Sundays, the diagnostic sample collection center operates from 09:00 AM to 01:00 PM IST; specialist outpatient consultations are scheduled Monday through Saturday.',
    questionTe: 'క్లినిక్ పని వేళలు మరియు ఆదివారం సమయాలు ఏమిటి?',
    answerTe:
      'సన్‌రైజ్ మల్టీ-స్పెషాలిటీ పాలీక్లినిక్ సోమవారం నుండి శనివారం వరకు ఉదయం 08:00 నుండి రాత్రి 08:00 వరకు తెరిచి ఉంటుంది. ఆదివారం ఉదయం 09:00 నుండి మధ్యాహ్నం 01:00 వరకు ల్యాబ్ పరీక్షల సేకరణ అందుబాటులో ఉంటుంది.',
    visibility: 'public',
  },
  {
    id: 'faq-appointments-1',
    clinicId: 'sunrise-multispecialty-hyderabad',
    category: 'appointments',
    question: 'How do I confirm a real-time doctor appointment slot?',
    answer:
      'ClinicConnect displays published doctor consultation schedules from approved clinic records. For live token reservation or urgent same-day slot confirmation, please call the reception desk at +91-40-2345-0199 or register at the outpatient desk starting at 07:45 AM IST.',
    questionTe: 'డాక్టర్ అపాయింట్‌మెంట్ స్లాట్ ఎలా నిర్ధారించుకోవాలి?',
    answerTe:
      'ఈ అసిస్టెంట్ ఆమోదించబడిన క్లినిక్ డాక్టర్ సమయాలను చూపుతుంది. ఖచ్చితమైన అపాయింట్‌మెంట్ స్లాట్ కోసం +91-40-2345-0199 నంబర్‌కు కాల్ చేయండి లేదా ఉదయం 07:45 గంటలకు కౌంటర్‌లో నమోదు చేసుకోండి.',
    visibility: 'public',
  },
  {
    id: 'faq-billing-1',
    clinicId: 'sunrise-multispecialty-hyderabad',
    category: 'billing',
    question: 'What are the outpatient consultation fees and payment options?',
    answer:
      'Published outpatient consultation fees are ₹500 for Internal Medicine (Dr. Priya Narayanan) and Pediatrics (Dr. Ananya Reddy), ₹600 for Orthopedics (Dr. S. Venkateswarlu), and ₹800 for Cardiology (Dr. K. Rajeshwar Rao). Follow-up reviews within 7 days for the same clinical episode carry no additional consultation fee. UPI, cards, and cash are accepted.',
    questionTe: 'కన్సల్టేషన్ ఫీజులు ఎంత మరియు ఏ చెల్లింపు పద్ధతులు అంగీకరించబడతాయి?',
    answerTe:
      'జనరల్ మెడిసిన్ మరియు పీడియాట్రిక్స్ ఫీజు ₹500, ఆర్థోపెడిక్స్ ₹600, మరియు కార్డియాలజీ ₹800. 7 రోజులలోపు ఫాలో-అప్ కన్సల్టేషన్ ఉచితం. UPI, కార్డులు మరియు నగదు అంగీకరించబడతాయి.',
    visibility: 'public',
  },
  {
    id: 'faq-lab-fasting',
    clinicId: 'sunrise-multispecialty-hyderabad',
    category: 'departments',
    question: 'How should I prepare for a fasting blood glucose or lipid profile panel?',
    answer:
      'For Fasting Plasma Glucose (FPG) and Comprehensive Lipid Profile tests, maintain an 8 to 10 hour overnight fast (plain water is permitted). Continue prescribed chronic medications unless instructed otherwise by your physician. Morning blood collection begins at 08:00 AM IST.',
    questionTe: 'ఫాస్టింగ్ బ్లడ్ షుగర్ లేదా లిపిడ్ ప్రొఫైల్ పరీక్ష కోసం ఎలా సిద్ధం కావాలి?',
    answerTe:
      'ఫాస్టింగ్ బ్లడ్ షుగర్ మరియు లిపిడ్ ప్రొఫైల్ పరీక్షల కోసం రాత్రి 8 నుండి 10 గంటల పాటు ఉపవాసం ఉండాలి (సాధారణ నీరు త్రాగవచ్చు). ఉదయం 08:00 గంటల నుండి శాంపిల్స్ సేకరించబడతాయి.',
    visibility: 'public',
  },
  {
    id: 'faq-emergency-protocol',
    clinicId: 'sunrise-multispecialty-hyderabad',
    category: 'emergency',
    question: 'Does the polyclinic operate a 24x7 emergency trauma or inpatient ICU unit?',
    answer:
      'No. Sunrise Multi-Specialty Polyclinic is an outpatient specialist and diagnostic facility and does not operate a 24x7 inpatient ICU or trauma center. For acute chest pain, severe dyspnea, stroke symptoms, or major trauma, call 108 / 112 immediately.',
    questionTe: 'పాలీక్లినిక్‌లో 24x7 అత్యవసర ICU సదుపాయం ఉందా?',
    answerTe:
      'లేదు. ఇది అవుట్-పేషెంట్ పాలీక్లినిక్ మాత్రమే, ఇక్కడ 24x7 ICU సదుపాయం లేదు. అత్యవసర పరిస్థితుల్లో వెంటనే 108 లేదా 112 కు కాల్ చేయండి.',
    visibility: 'public',
  },
];

export const SYNTHETIC_LAB_REPORTS = [
  {
    id: 'report-cbc-metabolic',
    title: 'Comprehensive Metabolic, Lipid & HbA1c Panel (Record #CLN-104)',
    description: 'Outpatient venous blood panel with glycemic, renal, and lipid biomarkers.',
    rawText: `CLINICAL PATHOLOGY & BIOCHEMISTRY REPORT
Record Reference: CLN-104 · Age/Sex: 48Y / F
Collection Date: 2026-10-18 · Specimen: Fasting Venous Blood & EDTA Whole Blood

Hemoglobin (Hb): 11.2 g/dL (12.0 - 15.5)
Total Leukocyte Count (WBC): 6800 cells/mcL (4000 - 11000)
Platelet Count: 245000 cells/mcL (150000 - 410000)
Fasting Plasma Glucose: 134 mg/dL (70 - 99)
HbA1c (Glycated Hemoglobin): 7.1 % (4.0 - 5.6)
Serum Creatinine: 0.9 mg/dL (0.6 - 1.1)
LDL Cholesterol: 148 mg/dL (0 - 100)
HDL Cholesterol: 44 mg/dL (40 - 60)
Triglycerides: 192 mg/dL (0 - 150)
Serum Vitamin D (25-OH): [Sample hemolyzed - repeat collection advised]
TSH (Ultrasensitive): 3.2 mIU/L (0.45 - 4.50)`,
  },
  {
    id: 'report-thyroid-iron',
    title: 'Hematology & Thyroid Function Evaluation (Record #CLN-209)',
    description: 'Outpatient hematology and endocrine panel with microcytic red cell indices.',
    rawText: `CLINICAL HEMATOLOGY & ENDOCRINOLOGY REPORT
Record Reference: CLN-209 · Age/Sex: 34Y / M
Collection Date: 2026-10-20 · Specimen: EDTA Whole Blood / Serum

Hemoglobin (Hb): 10.6 g/dL (13.0 - 17.0)
Mean Corpuscular Volume (MCV): 74.2 fL (80.0 - 100.0)
Serum Ferritin: 14 ng/mL
Free T4 (Thyroxine): 1.1 ng/dL (0.8 - 1.8)
TSH (Thyroid Stimulating Hormone): 5.8 mIU/L (0.45 - 4.50)
Peripheral Smear Note: Blurred ink stamp on slide remarks — unreadable morphology comment`,
  },
];

export const SYNTHETIC_CLINICAL_NOTES = [
  {
    id: 'note-1',
    title: 'Outpatient Encounter — Subacute Fever & Upper Respiratory Tract Assessment',
    noteText: `CLINICAL ENCOUNTER DOCUMENTATION
Presenting Complaint: 42-year-old adult presents with intermittent low-grade fever and dry cough for 5 days, along with mild fatigue for 3 days.
Explicit Negatives: Patient explicitly denies shortness of breath, denies chest pain, denies hemoptysis, and denies recent travel.
Relevant History: History of seasonal allergic rhinitis; no known history of diabetes or hypertension. Non-smoker.
Observations & Vitals:
- Temperature: 100.4 F (oral)
- Blood Pressure: 124/78 mmHg
- Heart Rate: 86 bpm
- SpO2: 98 % on room air
- Respiratory Rate: 16 breaths/min
- Chest auscultation: bilateral clear breath sounds, no wheezes or crackles.
Assessment: Suspect self-limiting upper respiratory tract viral syndrome vs. post-viral cough.
Plan:
1. Supportive hydration, warm saline gargles, and rest.
2. Paracetamol 500 mg orally every 6-8 hours as needed for fever above 100 F.
3. Return immediately if shortness of breath, persistent high fever > 102 F, or chest pain develops.
Note: Drug allergy status was not documented during intake; afternoon peak temperature log is unclear ("temp spikes PM?").`,
  },
  {
    id: 'note-2',
    title: 'Chronic Care Follow-Up — Essential Hypertension & Glycemic Control',
    noteText: `CLINICAL ENCOUNTER DOCUMENTATION
Presenting Complaint: Routine 3-month follow-up for essential hypertension and borderline elevated fasting glucose; reports occasional morning occipital headache for 1 week.
Explicit Negatives: Denies visual blurring, denies palpitations, denies pedal edema, and denies hypoglycemic episodes.
Relevant History: Diagnosed with Stage 1 Hypertension 2 years ago; currently taking Amlodipine 5 mg once daily. Family history of Type 2 Diabetes Mellitus.
Observations & Vitals:
- Blood Pressure: 146/92 mmHg (seated, right arm)
- Heart Rate: 74 bpm
- BMI: 27.4 kg/m2
- Fasting Capillary Glucose: 128 mg/dL
Assessment: Suboptimally controlled blood pressure with impaired fasting glucose.
Plan:
1. Continue Amlodipine 5 mg daily; reinforce dietary sodium restriction (< 2g/day).
2. Order fasting venous HbA1c, serum creatinine, and urine microalbumin panel.
3. Review home blood pressure diary in 2 weeks.
Note: Medication adherence over the past 10 days is ambiguous ("took tablets most days except travel week"); baseline ECG date missing.`,
  },
];

export const SAMPLE_HEALTH_ACCESS_SNIPPETS = [
  {
    id: 'snippet-hydration-ors',
    title: 'WHO Oral Rehydration Solution (ORS) Preparation & Warning Signs',
    text: `Oral Rehydration Salts (ORS) solution is essential for preventing and treating dehydration caused by acute watery diarrhea. Mix 1 full packet of standard low-osmolarity ORS into exactly 1 liter (1000 mL) of clean drinking water. Do not boil the solution after mixing, and discard any unused solution after 24 hours. Administer 50 to 100 mL after each loose stool for children under 2 years, and 100 to 200 mL for older children and adults. Seek immediate medical care if the patient exhibits lethargy, sunken eyes, inability to drink, persistent vomiting, or blood in the stool (dysentery).`,
  },
  {
    id: 'snippet-hypertension-discharge',
    title: 'Antihypertensive Discharge Instructions & Postural Precautions',
    text: `Take Tab. Telmisartan 40 mg orally once daily in the morning with or without food. Monitor seated blood pressure twice daily after 5 minutes of quiet rest. Avoid abrupt standing from a supine position to minimize orthostatic hypotension (dizziness upon standing). Avoid potassium-enriched salt substitutes without consulting your physician due to the risk of hyperkalemia. Contact your clinic if systolic blood pressure exceeds 180 mmHg or falls below 90 mmHg.`,
  },
];
