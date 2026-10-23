/**
 * Shared Clinical Intelligence, Validation, Safety & Grounding Utilities
 * Used by both server.ts, client modules, and automated test suites.
 */

export interface EmergencyCheckResult {
  isEmergency: boolean;
  matchedTriggers: string[];
  directiveEn: string;
  directiveTe: string;
  emergencyContacts: {
    indiaAmbulance: string;
    indiaNationalEmergency: string;
    mentalHealthKiran: string;
    international: string;
  };
}

const EMERGENCY_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'Chest pain or pressure', regex: /(\b(?:chest\s+pain|chest\s+pressure|crushing\s+chest|heart\s+attack)\b|గుండె\s*నొప్పి|ఛాతీ\s*నొప్పి)/i },
  { label: 'Severe breathing difficulty', regex: /(\b(?:can'?t\s+breathe|unable\s+to\s+breathe|severe\s+shortness\s+of\s+breath|gasping\s+for\s+air)\b|శ్వాస\s*ఆడటం\s*లేదు|ఊపిరి\s*ఆడటం\s*లేదు|శ్వాస\s*తీసుకోవడంలో\s*ఇబ్బంది)/i },
  { label: 'Stroke warning signs', regex: /(\b(?:stroke\s+symptoms|face\s+drooping|slurred\s+speech|one\s+side\s+weakness|sudden\s+numbness)\b|పక్షవాతం)/i },
  { label: 'Severe uncontrolled bleeding', regex: /(\b(?:severe\s+bleeding|uncontrolled\s+bleeding|coughing\s+up\s+blood|vomiting\s+blood)\b|తీవ్రమైన\s+రక్తస్రావం)/i },
  { label: 'Loss of consciousness or seizure', regex: /(\b(?:unconscious|fainted\s+and\s+not\s+waking|active\s+seizure|convulsions)\b|స్పృహ\s*కోల్పోవడం|మూర్ఛ)/i },
  { label: 'Severe allergic reaction (Anaphylaxis)', regex: /\b(anaphylaxis|throat\s+swelling|tongue\s+swelling\s+can'?t\s+swallow)\b/i },
  { label: 'Self-harm or acute crisis', regex: /(\b(?:suicide|kill\s+myself|end\s+my\s+life|want\s+to\s+die|overdose\s+of\s+pills)\b|ఆత్మహత్య)/i },
];

export function detectEmergencySymptoms(input: string): EmergencyCheckResult {
  const normalized = (input || '').trim();
  const matchedTriggers: string[] = [];

  for (const item of EMERGENCY_PATTERNS) {
    if (item.regex.test(normalized)) {
      matchedTriggers.push(item.label);
    }
  }

  const isEmergency = matchedTriggers.length > 0;
  return {
    isEmergency,
    matchedTriggers,
    directiveEn: isEmergency
      ? 'URGENT MEDICAL WARNING: The symptoms described (' +
        matchedTriggers.join(', ') +
        ') may indicate a life-threatening medical emergency. Please stop using this application and call emergency medical services immediately (108 or 112 in India; 911 in the US) or go to the nearest hospital emergency department.'
      : '',
    directiveTe: isEmergency
      ? 'అత్యవసర వైద్య హెచ్చరిక: మీరు పేర్కొన్న లక్షణాలు (' +
        matchedTriggers.join(', ') +
        ') ప్రాణాంతక అత్యవసర పరిస్థితిని సూచించవచ్చు. దయచేసి వెంటనే 108 లేదా 112 కు కాల్ చేయండి లేదా సమీపంలోని అత్యవసర ఆసుపత్రికి వెళ్లండి.'
      : '',
    emergencyContacts: {
      indiaAmbulance: '108 (Emergency Ambulance — India)',
      indiaNationalEmergency: '112 (National Emergency Response)',
      mentalHealthKiran: '14416 / 1800-599-0019 (Tele-MANAS / KIRAN)',
      international: '911 (US/Canada) · 999 (UK) · 112 (EU)',
    },
  };
}

export interface PiiScanResult {
  hasPII: boolean;
  findings: string[];
  redactedText: string;
}

export function scanForPotentialPII(text: string): PiiScanResult {
  const input = text || '';
  const findings: string[] = [];
  let redactedText = input;

  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  if (emailRegex.test(input)) {
    findings.push('Email address detected');
    redactedText = redactedText.replace(emailRegex, '[REDACTED_EMAIL]');
  }

  const phoneRegex = /(?:\+91[\-\s]?)?[6-9]\d{9}\b|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g;
  if (phoneRegex.test(input)) {
    findings.push('Phone/mobile number detected');
    redactedText = redactedText.replace(phoneRegex, '[REDACTED_PHONE]');
  }

  const aadhaarRegex = /\b\d{4}\s\d{4}\s\d{4}\b/g;
  if (aadhaarRegex.test(input)) {
    findings.push('12-digit national ID pattern (Aadhaar-like) detected');
    redactedText = redactedText.replace(aadhaarRegex, '[REDACTED_ID]');
  }

  const mrnNameRegex = /\b(Patient\s+Name|MRN|UHID|Aadhaar\s+No)\s*:\s*([^\n,;]+)/gi;
  if (mrnNameRegex.test(input)) {
    findings.push('Explicit patient identifier label (Patient Name / MRN / UHID) detected');
    redactedText = redactedText.replace(mrnNameRegex, '$1: [REDACTED_IDENTIFIER]');
  }

  return {
    hasPII: findings.length > 0,
    findings,
    redactedText,
  };
}

export interface MedStructSymptom {
  symptom: string;
  duration: string;
  severity: string;
  status: 'present' | 'explicitly_negative';
}

export interface MedStructMeasurement {
  metric: string;
  value: string;
  unit: string;
  verbatimQuote: string;
}

export interface MedStructAmbiguity {
  statement: string;
  reasonForReview: string;
}

export interface MedStructOutput {
  presentingComplaint: string;
  symptoms: MedStructSymptom[];
  relevantHistory: string[];
  observationsAndMeasurements: MedStructMeasurement[];
  assessment: string | null;
  plan: string[];
  missingInformation: string[];
  ambiguousStatements: MedStructAmbiguity[];
}

export interface SchemaValidationReport {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  groundingCheckPassed: boolean;
  validatedAt: string;
}

export function validateMedStructOutput(
  payload: unknown,
  sourceClinicalNote: string
): SchemaValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  let groundingCheckPassed = true;

  if (!payload || typeof payload !== 'object') {
    return {
      isValid: false,
      errors: ['Root output must be a non-null JSON object.'],
      warnings: [],
      groundingCheckPassed: false,
      validatedAt: new Date().toISOString(),
    };
  }

  const obj = payload as Record<string, unknown>;
  const requiredKeys = [
    'presentingComplaint',
    'symptoms',
    'relevantHistory',
    'observationsAndMeasurements',
    'assessment',
    'plan',
    'missingInformation',
    'ambiguousStatements',
  ];

  for (const key of requiredKeys) {
    if (!(key in obj)) {
      errors.push(`Missing required schema property: "${key}".`);
    }
  }

  if (typeof obj.presentingComplaint !== 'string' || obj.presentingComplaint.trim().length === 0) {
    errors.push('"presentingComplaint" must be a non-empty string.');
  }

  if (!Array.isArray(obj.symptoms)) {
    errors.push('"symptoms" must be an array.');
  } else {
    obj.symptoms.forEach((item, idx) => {
      if (!item || typeof item !== 'object') {
        errors.push(`symptoms[${idx}] must be an object.`);
        return;
      }
      const s = item as Record<string, unknown>;
      if (typeof s.symptom !== 'string' || !s.symptom.trim()) {
        errors.push(`symptoms[${idx}].symptom must be a non-empty string.`);
      }
      if (s.status !== 'present' && s.status !== 'explicitly_negative') {
        errors.push(
          `symptoms[${idx}].status must be either "present" or "explicitly_negative".`
        );
      }
    });
  }

  if (!Array.isArray(obj.relevantHistory)) {
    errors.push('"relevantHistory" must be an array of strings.');
  }

  if (!Array.isArray(obj.observationsAndMeasurements)) {
    errors.push('"observationsAndMeasurements" must be an array.');
  } else {
    const normalizedSource = (sourceClinicalNote || '').toLowerCase();
    obj.observationsAndMeasurements.forEach((item, idx) => {
      if (!item || typeof item !== 'object') {
        errors.push(`observationsAndMeasurements[${idx}] must be an object.`);
        return;
      }
      const m = item as Record<string, unknown>;
      if (typeof m.metric !== 'string' || !m.metric.trim()) {
        errors.push(`observationsAndMeasurements[${idx}].metric is required.`);
      }
      if (typeof m.value !== 'string' || !m.value.trim()) {
        errors.push(`observationsAndMeasurements[${idx}].value is required.`);
      } else {
        // Verify numeric tokens in value appear in sourceClinicalNote to prevent hallucinated vitals
        const numericTokens = m.value.match(/\d+(?:\.\d+)?/g) || [];
        for (const token of numericTokens) {
          if (!normalizedSource.includes(token)) {
            groundingCheckPassed = false;
            errors.push(
              `Unverified measurement value "${m.value}" (${m.metric}): numeric token "${token}" was not found in the source clinical note.`
            );
          }
        }
      }
    });
  }

  if (obj.assessment !== null && typeof obj.assessment !== 'string') {
    errors.push('"assessment" must be a string or null when undocumented.');
  }

  if (!Array.isArray(obj.plan)) {
    errors.push('"plan" must be an array of strings.');
  }

  if (!Array.isArray(obj.missingInformation)) {
    errors.push('"missingInformation" must be an array of strings.');
  } else if (obj.missingInformation.length === 0) {
    warnings.push('No missing information items flagged; verify completeness manually.');
  }

  if (!Array.isArray(obj.ambiguousStatements)) {
    errors.push('"ambiguousStatements" must be an array.');
  }

  return {
    isValid: errors.length === 0 && groundingCheckPassed,
    errors,
    warnings,
    groundingCheckPassed,
    validatedAt: new Date().toISOString(),
  };
}

export interface GroundedSourceCitation {
  id: string;
  title: string;
  uri: string;
  organization: string;
  authorityTier: 'PUBLIC_HEALTH_AUTHORITY' | 'PEER_REVIEWED_OR_ACADEMIC' | 'CLINICAL_REFERENCE' | 'GENERAL_WEB_SOURCE';
  publicationDate: string;
  dateAvailable: boolean;
}

export function getSafeCitationUrl(rawUri?: string, title?: string): string {
  const uri = (rawUri || '').trim();
  const cleanTitle = (title || '').trim();

  // Guard against dangerous schemes (XSS prevention)
  if (/^(javascript|data|vbscript):/i.test(uri)) {
    if (cleanTitle) {
      return `https://www.google.com/search?q=${encodeURIComponent(cleanTitle)}`;
    }
    return 'https://scholar.google.com';
  }

  // Handle empty, hash, or placeholder URIs
  if (!uri || uri === '#' || uri.toLowerCase() === 'about:blank') {
    // If title has explicit DOI
    const titleDoiMatch = cleanTitle.match(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+\b/);
    if (titleDoiMatch) {
      return `https://doi.org/${titleDoiMatch[0]}`;
    }
    // If title has explicit PMID
    const titlePmidMatch = cleanTitle.match(/\b(?:PMID:?\s*|pmid:)(\d{4,10})\b/i);
    if (titlePmidMatch) {
      return `https://pubmed.ncbi.nlm.nih.gov/${titlePmidMatch[1]}/`;
    }
    // If title has explicit PMCID
    const titlePmcMatch = cleanTitle.match(/\b(PMC\d{5,9})\b/i);
    if (titlePmcMatch) {
      return `https://www.ncbi.nlm.nih.gov/pmc/articles/${titlePmcMatch[1]}/`;
    }
    if (cleanTitle) {
      return `https://www.google.com/search?q=${encodeURIComponent(cleanTitle)}`;
    }
    return 'https://scholar.google.com';
  }

  // Handle DOI references (e.g. doi:10.1016/... or 10.1016/...)
  const doiMatch = uri.match(/^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)$/i);
  if (doiMatch) {
    return `https://doi.org/${doiMatch[1]}`;
  }

  // Handle PubMed PMID references (e.g. pmid:12345678 or PMID: 12345678)
  const pmidMatch = uri.match(/^(?:pmid:\s*|PMID:\s*)(\d{4,10})$/i);
  if (pmidMatch) {
    return `https://pubmed.ncbi.nlm.nih.gov/${pmidMatch[1]}/`;
  }

  // Handle PubMed Central PMCID references (e.g. pmc:PMC1234567 or PMC1234567)
  const pmcMatch = uri.match(/^(?:pmc:\s*)?(PMC\d{5,9})$/i);
  if (pmcMatch) {
    return `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcMatch[1]}/`;
  }

  // Protocol-relative (//example.com/...)
  if (uri.startsWith('//')) {
    return `https:${uri}`;
  }

  // Full HTTP/HTTPS URL
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }

  // Protocol-less domain (e.g. who.int/news-room or ncbi.nlm.nih.gov/pmc)
  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(uri)) {
    return `https://${uri}`;
  }

  // Generic domain pattern with path or query
  if (uri.includes('.') && !uri.includes(' ')) {
    return `https://${uri.replace(/^\/+/, '')}`;
  }

  // Otherwise fallback to search query with title or uri
  const queryTerm = cleanTitle || uri;
  if (queryTerm) {
    return `https://www.google.com/search?q=${encodeURIComponent(queryTerm)}`;
  }

  return 'https://scholar.google.com';
}

export function classifySourceAuthority(uri: string, title: string): GroundedSourceCitation {
  const safeTitle = (title || 'Untitled Web Source').trim();
  const normalizedUri = getSafeCitationUrl(uri, safeTitle);

  let hostname = 'unknown-source';
  try {
    hostname = new URL(normalizedUri).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    hostname = safeTitle.toLowerCase();
  }

  let organization = hostname;
  let authorityTier: GroundedSourceCitation['authorityTier'] = 'GENERAL_WEB_SOURCE';

  if (hostname.includes('who.int') || safeTitle.toLowerCase().includes('who.int')) {
    organization = 'World Health Organization (WHO)';
    authorityTier = 'PUBLIC_HEALTH_AUTHORITY';
  } else if (hostname.includes('mohfw.gov.in')) {
    organization = 'Ministry of Health & Family Welfare, Govt. of India (MoHFW)';
    authorityTier = 'PUBLIC_HEALTH_AUTHORITY';
  } else if (hostname.includes('ncdc.gov.in') || hostname.includes('ncdc.mohfw.gov.in')) {
    organization = 'National Centre for Disease Control (NCDC India)';
    authorityTier = 'PUBLIC_HEALTH_AUTHORITY';
  } else if (hostname.includes('icmr.nic.in') || hostname.includes('icmr.gov.in')) {
    organization = 'Indian Council of Medical Research (ICMR)';
    authorityTier = 'PUBLIC_HEALTH_AUTHORITY';
  } else if (hostname.includes('cdc.gov')) {
    organization = 'Centers for Disease Control and Prevention (CDC)';
    authorityTier = 'PUBLIC_HEALTH_AUTHORITY';
  } else if (
    hostname.includes('nih.gov') ||
    hostname.includes('ncbi.nlm.nih.gov') ||
    hostname.includes('medlineplus.gov') ||
    hostname.includes('nlm.nih.gov')
  ) {
    organization = 'National Institutes of Health (NIH / NLM)';
    authorityTier = 'PUBLIC_HEALTH_AUTHORITY';
  } else if (hostname.includes('nhs.uk')) {
    organization = 'National Health Service (NHS UK)';
    authorityTier = 'PUBLIC_HEALTH_AUTHORITY';
  } else if (
    hostname.includes('doi.org') ||
    hostname.includes('europepmc.org') ||
    hostname.includes('thelancet.com') ||
    hostname.includes('nejm.org') ||
    hostname.includes('bmj.com') ||
    hostname.includes('jamanetwork.com') ||
    hostname.includes('nature.com') ||
    hostname.includes('sciencedirect.com') ||
    hostname.endsWith('.edu') ||
    hostname.endsWith('.ac.in')
  ) {
    organization = `Academic / Peer-Reviewed (${hostname})`;
    authorityTier = 'PEER_REVIEWED_OR_ACADEMIC';
  } else if (
    hostname.includes('mayoclinic.org') ||
    hostname.includes('clevelandclinic.org') ||
    hostname.includes('hopkinsmedicine.org')
  ) {
    organization = `Clinical Reference (${hostname})`;
    authorityTier = 'CLINICAL_REFERENCE';
  }

  // Extract a 4-digit year or explicit date only if genuinely present in the title or URL
  const dateMatch = (safeTitle + ' ' + normalizedUri).match(/\b(202[0-6]|201\d)(?:[-/](0[1-9]|1[0-2])(?:[-/](0[1-9]|[12]\d|3[01]))?)?\b/);
  const dateAvailable = Boolean(dateMatch);
  const publicationDate = dateAvailable && dateMatch
    ? `Referenced date in source metadata: ${dateMatch[0]}`
    : 'Date not provided in search metadata';

  return {
    id: `src_${Math.random().toString(36).slice(2, 9)}`,
    title: safeTitle,
    uri: normalizedUri,
    organization,
    authorityTier,
    publicationDate,
    dateAvailable,
  };
}

/**
 * Local deterministic parser for PrivateMed report inspection prior to AI inference.
 * Extracts only values, units, and reference ranges explicitly present in text.
 */
export interface ParsedReportMetric {
  testName: string;
  observedValue: string;
  unit: string;
  referenceRange: string;
  flag: 'WITHIN_RANGE' | 'OUTSIDE_RANGE' | 'RANGE_NOT_SPECIFIED';
  rawLine: string;
}

export function extractExplicitReportMetrics(reportText: string): {
  metrics: ParsedReportMetric[];
  missingOrUnreadableWarnings: string[];
} {
  const lines = (reportText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const metrics: ParsedReportMetric[] = [];
  const missingOrUnreadableWarnings: string[] = [];

  // Pattern matching lines like: "Hemoglobin (Hb): 10.4 g/dL (Ref: 12.0 - 15.5)" or "HbA1c : 7.8 % [4.0 - 5.6]"
  const lineRegex = /^([A-Za-z0-9\s(),/.-]{2,45}?)\s*[:=-]\s*(\d+(?:\.\d+)?)\s*([a-zA-Z%/\u00B5\d.^]+)?(?:\s*(?:\(|\[|Ref\s*:?\s*|Range\s*:?\s*)?\s*(\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?|< ?\d+(?:\.\d+)?|> ?\d+(?:\.\d+)?)\s*(?:\)|\])?)?$/i;

  for (const line of lines) {
    if (/illegible|unreadable|blurred|missing|sample\s+hemolyzed|\?\?\?/i.test(line)) {
      missingOrUnreadableWarnings.push(`Ambiguous or unreadable report entry flagged: "${line}"`);
      continue;
    }
    const match = line.match(lineRegex);
    if (match) {
      const testName = match[1].trim();
      const observedValue = match[2].trim();
      const unit = (match[3] || 'Not specified').trim();
      const referenceRange = (match[4] || 'Not provided in report').trim();
      let flag: ParsedReportMetric['flag'] = 'RANGE_NOT_SPECIFIED';

      const numVal = parseFloat(observedValue);
      const rangeParts = referenceRange.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
      if (rangeParts && !isNaN(numVal)) {
        const low = parseFloat(rangeParts[1]);
        const high = parseFloat(rangeParts[2]);
        flag = numVal < low || numVal > high ? 'OUTSIDE_RANGE' : 'WITHIN_RANGE';
      }

      metrics.push({
        testName,
        observedValue,
        unit,
        referenceRange,
        flag,
        rawLine: line,
      });
    }
  }

  if (metrics.length === 0) {
    missingOrUnreadableWarnings.push(
      'No structured numeric test-value-range lines were automatically detected. Ensure values and reference ranges are present in the text.'
    );
  }

  return { metrics, missingOrUnreadableWarnings };
}
