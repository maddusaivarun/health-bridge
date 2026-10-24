import type { GroundedSourceCitation, EmergencyCheckResult, MedStructOutput, SchemaValidationReport } from '../shared/clinicalCore';
import type { RealtimeClinicalDatasetPayload } from '../components/HealthGuideModule';

export type ActiveWorkspace =
  | 'overview'
  | 'healthguide'
  | 'healthaccess'
  | 'clinicconnect'
  | 'privatemed'
  | 'medstruct'
  | 'bioscience'
  | 'governance';

const VALID_WORKSPACES: ReadonlySet<string> = new Set([
  'overview',
  'healthguide',
  'healthaccess',
  'clinicconnect',
  'privatemed',
  'medstruct',
  'bioscience',
  'governance',
]);

export const STORAGE_KEYS = {
  ACTIVE_TAB: 'hb_active_tab_v3',
  GLOBAL_SEARCH_QUERY: 'hb_global_search_query_v3',
  LANGUAGE: 'hb_language_v3',
  HEALTHACCESS_PREFILL: 'hb_healthaccess_prefill_v3',
  HEALTHGUIDE_STATE: 'hb_healthguide_state_v3',
  HEALTHACCESS_STATE: 'hb_healthaccess_state_v3',
  CLINICCONNECT_STATE: 'hb_clinicconnect_state_v3',
  MEDSTRUCT_STATE: 'hb_medstruct_state_v3',
  BIOSCIENCE_STATE: 'hb_bioscience_state_v3',
} as const;

export interface CachedConversationTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  latencyMs?: number;
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

export interface HealthGuideCachedState {
  queryText: string;
  datasetQuery: string;
  liveDataset: RealtimeClinicalDatasetPayload | null;
  useSearchGrounding: boolean;
  connectMedicalRecordsDb: boolean;
  turns: CachedConversationTurn[];
  lastExecutedGlobalSearch: string;
}

export interface HealthAccessCachedState {
  sourceText: string;
  sourceLanguage: 'en' | 'te';
  targetLanguage: 'en' | 'te';
  mode: 'simplify_and_translate' | 'simplify_only' | 'translate_only';
  followUpQuestion: string;
  result: any | null;
}

export interface ClinicConnectCachedState {
  question: string;
  qaResult: {
    answer: string;
    matchedRecordIds: string[];
    requiresStaffEscalation: boolean;
    escalationReason: string;
    publishedVsRealtimeNotice: string;
  } | null;
}

export interface MedStructCachedState {
  noteTitle: string;
  clinicalNote: string;
  structuredOutput: MedStructOutput | null;
  validationReport: SchemaValidationReport | null;
  matchedIcd10: Array<{ code: string; name: string }>;
  latencyMs: number | null;
  humanReviewStatus: 'PENDING_REVIEW' | 'APPROVED_FINAL';
}

export interface BioScienceCachedState {
  searchQuery: string;
  activeDomain: 'all' | 'proteins' | 'drugs' | 'genomics' | 'literature';
  resolvedData: any | null;
  analysisReport: any | null;
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore storage access errors in restricted iframes or SSR
  }
  return null;
}

export function readLocalStorage<T>(key: string, fallback: T): T {
  const storage = getStorage();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeLocalStorage<T>(key: string, value: T): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readCachedWorkspace(fallback: ActiveWorkspace = 'overview'): ActiveWorkspace {
  const raw = readLocalStorage<string>(STORAGE_KEYS.ACTIVE_TAB, fallback);
  return VALID_WORKSPACES.has(raw) ? (raw as ActiveWorkspace) : fallback;
}

export function readCachedLanguage(fallback: 'en' | 'te' = 'en'): 'en' | 'te' {
  const raw = readLocalStorage<string>(STORAGE_KEYS.LANGUAGE, fallback);
  return raw === 'te' || raw === 'en' ? raw : fallback;
}

export function clearHealthBridgeCache(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    Object.values(STORAGE_KEYS).forEach((k) => storage.removeItem(k));
  } catch {
    // Ignore
  }
}
