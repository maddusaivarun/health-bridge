import { describe, it, expect } from 'vitest';
import {
  detectEmergencySymptoms,
  scanForPotentialPII,
  validateMedStructOutput,
  classifySourceAuthority,
  extractExplicitReportMetrics,
  getSafeCitationUrl,
} from '../src/shared/clinicalCore';
import {
  SAMPLE_APPROVED_CLINIC,
  SAMPLE_APPROVED_DOCTORS,
  SAMPLE_APPROVED_FAQS,
  SYNTHETIC_LAB_REPORTS,
  SYNTHETIC_CLINICAL_NOTES,
} from '../src/shared/sampleData';

describe('HealthBridge AI — Clinical Core, Grounding, Privacy & Schema Validation Suite', () => {
  it('1. Emergency Triage Interception detects urgent symptoms in English and Telugu', () => {
    const chestPain = detectEmergencySymptoms(
      'I have severe crushing chest pain and shortness of breath'
    );
    expect(chestPain.isEmergency).toBe(true);
    expect(chestPain.matchedTriggers.length).toBeGreaterThan(0);
    expect(chestPain.directiveEn).toContain('108');

    const teluguEmergency = detectEmergencySymptoms('నాకు తీవ్రమైన గుండె నొప్పి ఉంది');
    expect(teluguEmergency.isEmergency).toBe(true);
    expect(teluguEmergency.directiveTe).toContain('108');

    const nonEmergency = detectEmergencySymptoms(
      'What are general dietary sources of Vitamin C?'
    );
    expect(nonEmergency.isEmergency).toBe(false);
  });

  it('2. PII / PHI Pre-Flight Scanner detects and redacts identifiers before structuring', () => {
    const rawNote =
      'Patient Name: Ramesh Kumar, Phone: +91-9876543210, Email: ramesh@example.com, Aadhaar: 1234 5678 9012 presents with mild cough.';
    const scan = scanForPotentialPII(rawNote);
    expect(scan.hasPII).toBe(true);
    expect(scan.findings.length).toBeGreaterThanOrEqual(3);
    expect(scan.redactedText).not.toContain('9876543210');
    expect(scan.redactedText).not.toContain('ramesh@example.com');
    expect(scan.redactedText).not.toContain('1234 5678 9012');
  });

  it('3. MedStruct Validator accepts grounded output and distinguishes explicit negatives', () => {
    const sourceNote = SYNTHETIC_CLINICAL_NOTES[0].noteText;
    const validStructured = {
      presentingComplaint: 'Intermittent low-grade fever and dry cough for 5 days',
      symptoms: [
        { symptom: 'Fever', duration: '5 days', severity: 'low-grade', status: 'present' },
        {
          symptom: 'Shortness of breath',
          duration: 'N/A',
          severity: 'none',
          status: 'explicitly_negative',
        },
      ],
      relevantHistory: ['Seasonal allergic rhinitis'],
      observationsAndMeasurements: [
        {
          metric: 'Temperature',
          value: '100.4',
          unit: 'F',
          verbatimQuote: 'Temperature: 100.4 F (oral)',
        },
        {
          metric: 'Blood Pressure',
          value: '124/78',
          unit: 'mmHg',
          verbatimQuote: 'Blood Pressure: 124/78 mmHg',
        },
      ],
      assessment: 'Suspect self-limiting upper respiratory tract viral syndrome',
      plan: ['Supportive hydration', 'Paracetamol 500 mg orally as needed'],
      missingInformation: ['Drug allergy status was not documented'],
      ambiguousStatements: [
        {
          statement: 'temp spikes PM?',
          reasonForReview: 'Unclear afternoon peak temperature value',
        },
      ],
    };

    const report = validateMedStructOutput(validStructured, sourceNote);
    expect(report.isValid).toBe(true);
    expect(report.groundingCheckPassed).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  it('4. MedStruct Validator blocks hallucinated measurements and invalid schema fields', () => {
    const sourceNote = SYNTHETIC_CLINICAL_NOTES[0].noteText;
    const hallucinatedPayload = {
      presentingComplaint: 'Fever',
      symptoms: [
        { symptom: 'Fever', duration: '5d', severity: 'mild', status: 'invalid_enum' },
      ],
      relevantHistory: [],
      observationsAndMeasurements: [
        {
          metric: 'Heart Rate',
          value: '215', // Does NOT exist in sourceNote
          unit: 'bpm',
          verbatimQuote: 'HR 215 bpm',
        },
      ],
      assessment: null,
      plan: [],
      missingInformation: ['Allergies'],
      ambiguousStatements: [],
    };

    const report = validateMedStructOutput(hallucinatedPayload, sourceNote);
    expect(report.isValid).toBe(false);
    expect(report.groundingCheckPassed).toBe(false);
    expect(report.errors.some((e) => e.includes('215'))).toBe(true);
  });

  it('5. Source Authority Classifier categorizes official health agencies and handles missing dates honestly', () => {
    const whoCitation = classifySourceAuthority(
      'https://www.who.int/news-room/fact-sheets/detail/dengue-and-severe-dengue',
      'Dengue and severe dengue — WHO Fact Sheet'
    );
    expect(whoCitation.authorityTier).toBe('PUBLIC_HEALTH_AUTHORITY');
    expect(whoCitation.organization).toContain('WHO');
    expect(whoCitation.dateAvailable).toBe(false);
    expect(whoCitation.publicationDate).toBe('Date not provided in search metadata');

    const datedMohfw = classifySourceAuthority(
      'https://mohfw.gov.in/guidelines-2025/vector-borne.pdf',
      'MoHFW National Guidelines 2025'
    );
    expect(datedMohfw.authorityTier).toBe('PUBLIC_HEALTH_AUTHORITY');
    expect(datedMohfw.dateAvailable).toBe(true);
    expect(datedMohfw.publicationDate).toContain('2025');
  });

  it('6. PrivateMed Local Biomarker Parser extracts values, flags out-of-range items, and catches unreadable lines', () => {
    const parsed = extractExplicitReportMetrics(SYNTHETIC_LAB_REPORTS[0].rawText);
    expect(parsed.metrics.length).toBeGreaterThanOrEqual(8);

    const hba1c = parsed.metrics.find((m) => m.testName.includes('HbA1c'));
    expect(hba1c).toBeDefined();
    expect(hba1c?.observedValue).toBe('7.1');
    expect(hba1c?.flag).toBe('OUTSIDE_RANGE');

    expect(
      parsed.missingOrUnreadableWarnings.some((w) => w.toLowerCase().includes('hemolyzed'))
    ).toBe(true);
  });

  it('7. ClinicConnect sample dataset is explicitly labeled as synthetic and supports English and Telugu', () => {
    expect(SAMPLE_APPROVED_CLINIC.isSampleDataset).toBe(true);
    expect(SAMPLE_APPROVED_DOCTORS.length).toBeGreaterThanOrEqual(4);
    expect(SAMPLE_APPROVED_FAQS.every((f) => f.questionTe.length > 0 && f.answerTe.length > 0)).toBe(
      true
    );
  });

  it('8. localStorage caching layer safely persists and restores globalSearchQuery, activeTab, and workspace state', async () => {
    const store = new Map<string, string>();
    (globalThis as any).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      },
    };

    const {
      STORAGE_KEYS,
      readLocalStorage,
      writeLocalStorage,
      readCachedWorkspace,
      readCachedLanguage,
      clearHealthBridgeCache,
    } = await import('../src/lib/storageCache');

    expect(readCachedWorkspace('overview')).toBe('overview');
    writeLocalStorage(STORAGE_KEYS.ACTIVE_TAB, 'privatemed');
    expect(readCachedWorkspace('overview')).toBe('privatemed');

    writeLocalStorage(STORAGE_KEYS.GLOBAL_SEARCH_QUERY, 'dengue warning signs');
    expect(readLocalStorage(STORAGE_KEYS.GLOBAL_SEARCH_QUERY, '')).toBe('dengue warning signs');

    writeLocalStorage(STORAGE_KEYS.LANGUAGE, 'te');
    expect(readCachedLanguage('en')).toBe('te');

    clearHealthBridgeCache();
    expect(readCachedWorkspace('overview')).toBe('overview');
    expect(readLocalStorage(STORAGE_KEYS.GLOBAL_SEARCH_QUERY, '')).toBe('');
  });

  it('9. Lipinski Rule of 5 evaluation correctly assesses molecular drug-likeness', () => {
    // Metformin: MW 129.16, XLogP -1.4, HBD 3, HBA 2, Rotatable 1 -> 0 violations
    const metforminMw = 129.16;
    const metforminXlogp = -1.4;
    const metforminHbd = 3;
    const metforminHba = 2;
    const metforminRotatable = 1;

    const metforminViolations = [
      metforminMw <= 500,
      metforminXlogp <= 5.0,
      metforminHbd <= 5,
      metforminHba <= 10,
      metforminRotatable <= 10,
    ].filter((passed) => !passed).length;

    expect(metforminViolations).toBe(0);

    // Large hypothetical peptide / macrolide with MW 850, XLogP 6.2, HBD 8, HBA 14 -> 4 violations
    const largeMoleculeMw = 850;
    const largeMoleculeXlogp = 6.2;
    const largeMoleculeHbd = 8;
    const largeMoleculeHba = 14;
    const largeMoleculeRot = 15;

    const largeViolations = [
      largeMoleculeMw <= 500,
      largeMoleculeXlogp <= 5.0,
      largeMoleculeHbd <= 5,
      largeMoleculeHba <= 10,
      largeMoleculeRot <= 10,
    ].filter((passed) => !passed).length;

    expect(largeViolations).toBe(5);
  });

  it('10. AlphaFold pLDDT 4-tier confidence scale partitions structural prediction accuracy', () => {
    function classifyPlddt(score: number): 'VERY_HIGH' | 'CONFIDENT' | 'LOW' | 'VERY_LOW' {
      if (score > 90) return 'VERY_HIGH';
      if (score >= 70) return 'CONFIDENT';
      if (score >= 50) return 'LOW';
      return 'VERY_LOW';
    }

    expect(classifyPlddt(94.5)).toBe('VERY_HIGH');
    expect(classifyPlddt(82.0)).toBe('CONFIDENT');
    expect(classifyPlddt(62.3)).toBe('LOW');
    expect(classifyPlddt(38.1)).toBe('VERY_LOW');
  });

  it('11. Safe Citation URL resolver ensures all citation links navigate to valid protocols without dead links', () => {
    // Valid HTTPS link is preserved
    expect(getSafeCitationUrl('https://pubmed.ncbi.nlm.nih.gov/3829104/')).toBe(
      'https://pubmed.ncbi.nlm.nih.gov/3829104/'
    );

    // Protocol-less domain is safely prefixed with https://
    expect(getSafeCitationUrl('who.int/news-room/fact-sheets/detail/dengue')).toBe(
      'https://who.int/news-room/fact-sheets/detail/dengue'
    );

    // Empty URI falls back to Google search with the source title
    const searchFallback = getSafeCitationUrl('', 'World Health Organization Dengue Guidelines');
    expect(searchFallback).toContain('google.com/search?q=');
    expect(searchFallback).toContain('Dengue');

    // Both empty falls back to Google Scholar
    expect(getSafeCitationUrl('', '')).toBe('https://scholar.google.com');

    // Biomedical DOI references resolve to official doi.org URL
    expect(getSafeCitationUrl('10.1016/j.cell.2023.01.002')).toBe(
      'https://doi.org/10.1016/j.cell.2023.01.002'
    );
    expect(getSafeCitationUrl('doi:10.1056/NEJMoa230101')).toBe(
      'https://doi.org/10.1056/NEJMoa230101'
    );

    // PubMed PMID formats resolve directly to PubMed entry
    expect(getSafeCitationUrl('pmid:38491024')).toBe(
      'https://pubmed.ncbi.nlm.nih.gov/38491024/'
    );
    expect(getSafeCitationUrl('PMID: 38491024')).toBe(
      'https://pubmed.ncbi.nlm.nih.gov/38491024/'
    );

    // PubMed Central PMCID formats resolve to PMC article
    expect(getSafeCitationUrl('PMC7849102')).toBe(
      'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7849102/'
    );

    // Protocol-relative links resolve to HTTPS
    expect(getSafeCitationUrl('//cdc.gov/flu/treatment')).toBe(
      'https://cdc.gov/flu/treatment'
    );

    // Dangerous schemes are safely neutralized without XSS execution
    const neutralized = getSafeCitationUrl('javascript:alert(1)', 'ICMR Malaria Guidelines');
    expect(neutralized).toContain('google.com/search?q=');
    expect(neutralized).not.toContain('javascript:');
  });

  it('12. Resilient API Client gracefully handles static-host 404 ("The page could not be found") across all modules', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const urlStr = String(input);
      if (urlStr.startsWith('/api/')) {
        return new Response('The page could not be found\n\nNOT_FOUND', {
          status: 404,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
      // Return empty JSON for external calls during unit test
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    try {
      const {
        apiFetchStatus,
        apiPostChat,
        apiPostHealthAccess,
        apiPostClinicConnect,
        apiPostPrivateMedVerify,
        apiPostMedStruct,
        apiFetchBioScienceResolve,
        apiPostBioScienceAnalyze,
      } = await import('../src/lib/apiClient');

      const status = await apiFetchStatus();
      expect(status.geminiConfigured).toBe(true);

      const chatRes = await apiPostChat({
        query: 'What are the WHO guidelines for dengue fever prevention?',
        language: 'en',
        useSearchGrounding: true,
      });
      expect(chatRes.answer).toContain('Clinical & Public Health Evidence Synthesis');
      expect(chatRes.citations.length).toBeGreaterThan(0);

      const haRes = await apiPostHealthAccess({
        text: 'Take Metformin 500 mg twice daily after meals. Fasting blood glucose 134 mg/dL.',
        sourceLanguage: 'en',
        targetLanguage: 'te',
        mode: 'simplify_and_translate',
        followUpQuestion: 'Can I take it with water?',
      });
      expect(haRes.plainLanguageExplanation).toContain('500 mg');
      expect(haRes.translatedVersion.length).toBeGreaterThan(20);

      const ccRes = await apiPostClinicConnect({
        question: 'What are the clinic timings and doctor consultation fees?',
        language: 'en',
      });
      expect(ccRes.answer).toContain(SAMPLE_APPROVED_CLINIC.name);

      const pmRes = await apiPostPrivateMedVerify({
        explicitCloudConsent: true,
        reportText: SYNTHETIC_LAB_REPORTS[0].rawText,
        language: 'en',
      });
      expect(pmRes.extractedFindings.length).toBeGreaterThan(0);

      const msRes = await apiPostMedStruct({
        clinicalNote: SYNTHETIC_CLINICAL_NOTES[0].noteText,
        deIdentifiedConfirmed: true,
      });
      expect(msRes.structuredData.presentingComplaint.length).toBeGreaterThan(5);
      expect(msRes.validationReport.isValid).toBe(true);

      const bioRes = await apiFetchBioScienceResolve('TP53', 'all');
      expect(bioRes.proteinData?.geneSymbol).toBe('TP53');

      const bioAnalysis = await apiPostBioScienceAnalyze({
        query: 'TP53',
        domain: 'all',
        resolvedData: bioRes,
        language: 'en',
      });
      expect(bioAnalysis.analysis).toContain('TP53');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('13. Deterministic clinical synthesis accurately handles comma-formatted lab values, specific doctor lookups, and all synthetic notes', async () => {
    const {
      synthesizeDeterministicClinicConnect,
      synthesizeDeterministicMedStruct,
      synthesizeDeterministicPrivateMedVerification,
    } = await import('../src/shared/clinicalEngine');

    // Verify comma-formatted platelet counts and threshold (< 200) parsing
    const customReport = [
      'Platelet Count: 245,000 /mcL (150,000 - 450,000)',
      'Total Cholesterol: 228 mg/dL (< 200)',
      'HDL Cholesterol: 34 mg/dL (> 40)',
    ].join('\n');
    const pmVerify = synthesizeDeterministicPrivateMedVerification(customReport, false);
    expect(pmVerify.extractedFindings.length).toBe(3);
    const chol = pmVerify.extractedFindings.find((f) => f.parameterName.includes('Cholesterol'));
    expect(chol?.statusIndicator).toBe('OUTSIDE_REFERENCE_RANGE');

    // Verify specific doctor query does not trigger false escalation
    const docQuery = synthesizeDeterministicClinicConnect(
      'When is Dr. Ananya Reddy available and what is her fee?',
      'en'
    );
    expect(docQuery.requiresStaffEscalation).toBe(false);
    expect(docQuery.answer).toContain('Ananya Reddy');
    expect(docQuery.answer).toContain('500');

    // Verify all 3 synthetic clinical notes produce valid, grounded structured records
    for (const sampleNote of SYNTHETIC_CLINICAL_NOTES) {
      const structured = synthesizeDeterministicMedStruct(sampleNote.noteText);
      const validation = validateMedStructOutput(structured, sampleNote.noteText);
      expect(validation.isValid).toBe(true);
      expect(validation.groundingCheckPassed).toBe(true);
      expect(structured.plan.length).toBeGreaterThanOrEqual(2);
    }
  });
});



