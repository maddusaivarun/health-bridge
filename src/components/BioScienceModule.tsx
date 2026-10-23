import React, { useState, useEffect, useRef } from 'react';
import {
  Dna,
  Search,
  ExternalLink,
  Layers,
  Pill,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  BookOpen,
  ArrowRight,
  Database,
  Activity,
  FileCode2,
  Atom,
  CheckCircle2,
  XCircle,
  Clock,
  Compass,
} from 'lucide-react';
import {
  STORAGE_KEYS,
  readLocalStorage,
  writeLocalStorage,
  BioScienceCachedState,
} from '../lib/storageCache';
import { GroundedSourceCitation, getSafeCitationUrl } from '../shared/clinicalCore';

interface BioScienceModuleProps {
  language: 'en' | 'te';
  initialQuery?: string;
}

interface BioScienceResolvedPayload {
  query: string;
  domain: 'proteins' | 'drugs' | 'genomics' | 'literature' | 'all';
  entityType: 'protein' | 'drug' | 'variant' | 'general';
  proteinData?: {
    geneSymbol: string;
    proteinName: string;
    uniprotAccession: string;
    organism: string;
    sequenceLength: number;
    functionSummary: string;
    alphaFold: {
      entryId: string;
      cifUrl: string;
      pdbUrl: string;
      bcifUrl: string;
      paeImageUrl: string;
      paeDocUrl: string;
      plddtCategories: {
        veryHigh: string;
        confident: string;
        low: string;
        veryLow: string;
      };
    };
    experimentalPdb: {
      pdbIds: string[];
      viewUrl: string;
    };
  };
  drugData?: {
    name: string;
    cid: number;
    molecularFormula: string;
    molecularWeight: number;
    canonicalSmiles: string;
    structureImageUrl: string;
    properties: {
      xlogp: number;
      tpsa: number;
      hBondDonors: number;
      hBondAcceptors: number;
      rotatableBonds: number;
    };
    lipinskiRuleOf5: {
      passesRuleOfFive: boolean;
      violationsCount: number;
      rules: Array<{ name: string; value: string; threshold: string; passed: boolean }>;
    };
    openFdaSafety: {
      boxedWarning: string;
      primaryIndication: string;
    };
  };
  variantData?: {
    variantIdentifier: string;
    clinVarUrl: string;
    alphaGenomeAtlasUrl: string;
    clinicalSignificance: string;
    reviewStatus: string;
  };
  literatureArticles: Array<{
    pmid: string;
    title: string;
    journal: string;
    pubYear: string;
    url: string;
    doi?: string;
  }>;
  fetchedAt: string;
  latencyMs: number;
}

interface BioScienceAnalysisPayload {
  query: string;
  domain: string;
  analysis: string;
  modelUsed: string;
  citations: GroundedSourceCitation[];
  searchQueries: string[];
  latencyMs: number;
}

const PRESET_TARGETS = [
  { label: 'TP53 (p53 Tumor Suppressor)', query: 'TP53', type: 'protein' },
  { label: 'BRCA1 (DNA Repair)', query: 'BRCA1', type: 'protein' },
  { label: 'EGFR (Kinase Receptor)', query: 'EGFR', type: 'protein' },
  { label: 'ACE2 (SARS-CoV-2 Receptor)', query: 'ACE2', type: 'protein' },
  { label: 'PCSK9 (Cholesterol)', query: 'PCSK9', type: 'protein' },
  { label: 'Metformin (Antidiabetic)', query: 'Metformin', type: 'drug' },
  { label: 'Imatinib (BCR-ABL Inhibitor)', query: 'Imatinib', type: 'drug' },
  { label: 'Aspirin (Antiplatelet)', query: 'Aspirin', type: 'drug' },
  { label: 'KRAS G12D (Oncogenic Variant)', query: 'KRAS G12D', type: 'variant' },
];

function renderBioScienceTextWithCitations(
  text: string,
  citations?: GroundedSourceCitation[]
): React.ReactNode {
  if (!text) return '';
  if (!citations || citations.length === 0) return text;

  // Support single [1] and comma-separated citations [1, 2]
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
              key={`cit-bio-${citationNum}-${matchIndex}-${subIdx}`}
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open biomedical source citation [${citationNum}]: ${cit.title}`}
              title={`[${citationNum}] ${cit.title} (${cit.organization || 'Verified Authority'})\nClick to open source: ${sourceUrl}`}
              className="inline-flex items-center align-baseline px-1.5 py-0.5 mx-0.5 text-[11px] font-mono font-bold text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
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

const BioScienceModuleComponent: React.FC<BioScienceModuleProps> = ({
  language,
  initialQuery = 'TP53',
}) => {
  const cachedState = useRef<BioScienceCachedState | null>(
    readLocalStorage<BioScienceCachedState | null>(STORAGE_KEYS.BIOSCIENCE_STATE, null)
  ).current;

  const [searchQuery, setSearchQuery] = useState<string>(
    () => initialQuery || cachedState?.searchQuery || 'TP53'
  );
  const [activeDomain, setActiveDomain] = useState<'all' | 'proteins' | 'drugs' | 'genomics' | 'literature'>(
    () => cachedState?.activeDomain || 'all'
  );

  const [resolvedData, setResolvedData] = useState<BioScienceResolvedPayload | null>(
    () => cachedState?.resolvedData || null
  );
  const [analysisReport, setAnalysisReport] = useState<BioScienceAnalysisPayload | null>(
    () => cachedState?.analysisReport || null
  );

  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Synchronize state with localStorage
  useEffect(() => {
    writeLocalStorage<BioScienceCachedState>(STORAGE_KEYS.BIOSCIENCE_STATE, {
      searchQuery,
      activeDomain,
      resolvedData,
      analysisReport,
    });
  }, [searchQuery, activeDomain, resolvedData, analysisReport]);

  const handleResolveTarget = async (termToResolve?: string) => {
    const term = (termToResolve || searchQuery).trim();
    if (!term) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/bioscience/resolve?q=${encodeURIComponent(term)}&domain=${activeDomain}`);
      if (!res.ok) {
        throw new Error(`Failed to resolve bioscience target (${res.status})`);
      }
      const data: BioScienceResolvedPayload = await res.json();
      setResolvedData(data);
      setSearchQuery(term);

      // Auto-trigger Gemini 3.8 Flash Search Grounded synthesis
      handleGenerateAnalysis(term, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error resolving bioscience target');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAnalysis = async (targetQuery: string, dataToAnalyze: BioScienceResolvedPayload) => {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/bioscience/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: targetQuery,
          domain: activeDomain,
          resolvedData: dataToAnalyze,
          language,
        }),
      });
      if (res.ok) {
        const report: BioScienceAnalysisPayload = await res.json();
        setAnalysisReport(report);
      }
    } catch {
      // Non-fatal
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    if (!resolvedData) {
      handleResolveTarget(searchQuery || 'TP53');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8">
      {/* Module Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="text-xs font-medium text-teal-700 mb-1">
              06. BioScience Intelligence · AlphaFold DB, PubChem, ClinVar, Europe PMC &amp; Gemini 3.8 Flash Search Grounding
            </div>
            <h2 className="text-2xl font-bold text-slate-900">
              Macromolecular, Pharmacology &amp; Genomic Intelligence Workbench
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              Query protein 3D structures via AlphaFold DB, inspect Lipinski Rule of 5 drug properties via PubChem, review ACMG variant significance in ClinVar, deep-link to AlphaGenome Atlas, and generate scientific reports grounded by Google Search and Europe PMC.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="text-xs font-mono text-teal-700 bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Model: gemini-3.8-flash (Search Grounded)</span>
            </span>
          </div>
        </div>

        {/* Quick-Try Preset Target Pills */}
        <div className="pt-4 space-y-2">
          <div className="text-xs font-semibold text-slate-700 flex items-center justify-between">
            <span>Authoritative Reference Biological Targets &amp; Molecules:</span>
            <span className="text-slate-400 font-mono text-[11px]">Click to inspect in 1 click</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESET_TARGETS.map((item) => (
              <button
                key={item.query}
                type="button"
                onClick={() => {
                  setSearchQuery(item.query);
                  handleResolveTarget(item.query);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                  searchQuery.toUpperCase() === item.query.toUpperCase()
                    ? 'bg-teal-700 text-white border-teal-700'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Search & Domain Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleResolveTarget();
          }}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search gene (TP53, BRCA1, EGFR), UniProt accession (P04637), molecule (Metformin, Imatinib), or variant (KRAS G12D)..."
              className="w-full pl-10 pr-4 py-2.5 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={activeDomain}
              onChange={(e) => setActiveDomain(e.target.value as any)}
              className="px-3 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
            >
              <option value="all">All Domains (Proteins, Drugs, Genomics)</option>
              <option value="proteins">Proteins &amp; AlphaFold DB</option>
              <option value="drugs">Drugs &amp; PubChem</option>
              <option value="genomics">Genomics &amp; ClinVar</option>
              <option value="literature">Europe PMC Literature</option>
            </select>

            <button
              type="submit"
              disabled={loading || !searchQuery.trim()}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>{loading ? 'Resolving...' : 'Explore Target'}</span>
            </button>
          </div>
        </form>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Main 2-Column Multi-Pane Scientific Workbench Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): Structural & Molecular Data Inspectors */}
        <div className="lg:col-span-7 space-y-6">
          {resolvedData && (
            <>
              {/* Target Overview Card with Epistemic Badges */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <div className="text-xs font-mono text-teal-700 font-semibold uppercase">
                      TARGET IDENTITY &amp; EVIDENCE PROVENANCE
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mt-0.5">
                      {resolvedData.proteinData?.geneSymbol || resolvedData.drugData?.name || resolvedData.query}
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-mono px-2 py-1 bg-slate-100 text-slate-700 rounded border border-slate-200">
                      [Experimentally Determined]
                    </span>
                    <span className="text-[11px] font-mono px-2 py-1 bg-teal-50 text-teal-800 rounded border border-teal-200">
                      [AlphaFold Model Predicted]
                    </span>
                    <span className="text-[11px] font-mono px-2 py-1 bg-blue-50 text-blue-800 rounded border border-blue-200">
                      [Literature Curated]
                    </span>
                  </div>
                </div>

                <div className="text-xs text-slate-700 leading-relaxed">
                  {resolvedData.proteinData?.functionSummary ||
                    resolvedData.drugData?.openFdaSafety.primaryIndication ||
                    'Authoritative biological and chemical knowledge parsed from UniProt, AlphaFold DB, PubChem, and Europe PMC.'}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-xs font-mono">
                  <div className="p-2 bg-slate-50 rounded border border-slate-200">
                    <div className="text-[10px] text-slate-500 uppercase">Organism</div>
                    <div className="font-semibold text-slate-900 truncate">
                      {resolvedData.proteinData?.organism || 'Homo sapiens'}
                    </div>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-200">
                    <div className="text-[10px] text-slate-500 uppercase">UniProt Accession</div>
                    <div className="font-semibold text-teal-700">
                      {resolvedData.proteinData?.uniprotAccession || 'P04637'}
                    </div>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-200">
                    <div className="text-[10px] text-slate-500 uppercase">Sequence Length</div>
                    <div className="font-semibold text-slate-900">
                      {resolvedData.proteinData?.sequenceLength || 393} aa
                    </div>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-200">
                    <div className="text-[10px] text-slate-500 uppercase">Resolution Latency</div>
                    <div className="font-semibold text-slate-900">{resolvedData.latencyMs} ms</div>
                  </div>
                </div>
              </div>

              {/* 1. AlphaFold DB 3D Biomolecular Structure Card */}
              {resolvedData.proteinData && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <div className="flex items-center gap-2">
                      <Dna className="w-5 h-5 text-teal-700" />
                      <div>
                        <h4 className="text-base font-bold text-slate-900">
                          AlphaFold DB 3D Macromolecular Prediction
                        </h4>
                        <span className="text-xs text-slate-500 font-mono">
                          Entry ID: {resolvedData.proteinData.alphaFold.entryId}
                        </span>
                      </div>
                    </div>
                    <a
                      href={`https://alphafold.ebi.ac.uk/entry/${resolvedData.proteinData.uniprotAccession}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
                    >
                      <span>AlphaFold DB Entry</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  {/* Canonical 4-Tier pLDDT Confidence Scale Display (Science Constitution) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                      <span>AlphaFold Model Confidence (Per-Residue pLDDT Scale):</span>
                      <span className="font-mono text-slate-500 text-[11px]">0 to 100 Scale</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-lg border border-blue-200 bg-blue-50/50 flex items-start gap-2">
                        <div className="w-3.5 h-3.5 rounded-full bg-[#0053D6] shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-[#0053D6]">Very High (&gt; 90)</div>
                          <p className="text-[11px] text-slate-600">
                            High accuracy for backbone and sidechain rotamers; suitable for active site / pocket investigation.
                          </p>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg border border-sky-200 bg-sky-50/50 flex items-start gap-2">
                        <div className="w-3.5 h-3.5 rounded-full bg-[#65CBF3] shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-[#0284C7]">Confident (70 - 90)</div>
                          <p className="text-[11px] text-slate-600">
                            Reliable overall backbone fold topology; secondary structure motifs resolved.
                          </p>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50/50 flex items-start gap-2">
                        <div className="w-3.5 h-3.5 rounded-full bg-[#FFDB13] shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-amber-700">Low (50 - 70)</div>
                          <p className="text-[11px] text-slate-600">
                            Backbone fold should be treated with caution; typical for flexible loops and linkers.
                          </p>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg border border-orange-200 bg-orange-50/50 flex items-start gap-2">
                        <div className="w-3.5 h-3.5 rounded-full bg-[#FF7D45] shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-orange-700">Very Low (&lt; 50)</div>
                          <p className="text-[11px] text-slate-600">
                            Strongly indicates Intrinsically Disordered Protein Regions (IDPRs); do not interpret as a fixed fold.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Direct Coordinate & PAE Matrix Downloads */}
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <span className="text-slate-600">Official Structure Coordinates:</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={resolvedData.proteinData.alphaFold.cifUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-mono text-[11px] font-semibold"
                      >
                        Download mmCIF (.cif)
                      </a>
                      <a
                        href={resolvedData.proteinData.alphaFold.pdbUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-mono text-[11px] font-semibold"
                      >
                        Download PDB (.pdb)
                      </a>
                      <a
                        href={resolvedData.proteinData.alphaFold.paeDocUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded font-mono text-[11px] font-semibold"
                      >
                        PAE Matrix JSON
                      </a>
                      <a
                        href={resolvedData.proteinData.experimentalPdb.viewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded font-mono text-[11px] font-semibold inline-flex items-center gap-1"
                      >
                        <span>RCSB PDB ({resolvedData.proteinData.experimentalPdb.pdbIds.join(', ')})</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. PubChem Chemical Structure & Lipinski Rule of 5 Card */}
              {resolvedData.drugData && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <div className="flex items-center gap-2">
                      <Pill className="w-5 h-5 text-teal-700" />
                      <div>
                        <h4 className="text-base font-bold text-slate-900">
                          {resolvedData.drugData.name} · PubChem Pharmacology
                        </h4>
                        <span className="text-xs text-slate-500 font-mono">
                          CID: {resolvedData.drugData.cid} · Formula: {resolvedData.drugData.molecularFormula}
                        </span>
                      </div>
                    </div>
                    <a
                      href={`https://pubchem.ncbi.nlm.nih.gov/compound/${resolvedData.drugData.cid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
                    >
                      <span>PubChem Record</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  {/* 2D Structure Diagram & Lipinski Scorecard */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
                    <div className="sm:col-span-4 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col items-center justify-center">
                      <img
                        src={resolvedData.drugData.structureImageUrl}
                        alt={`${resolvedData.drugData.name} 2D chemical structure diagram`}
                        className="max-h-40 object-contain bg-white rounded border border-slate-200 p-1"
                        onError={(e) => {
                          // Fallback to PubChem direct if proxy experiences issue
                          (e.target as HTMLImageElement).src = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${resolvedData.drugData?.cid}/PNG?image_size=300x300`;
                        }}
                      />
                      <span className="text-[11px] font-mono text-slate-500 mt-2">
                        PubChem 2D Depiction
                      </span>
                    </div>

                    <div className="sm:col-span-8 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">
                          Lipinski Rule of 5 Drug-Likeness Evaluation:
                        </span>
                        <span
                          className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                            resolvedData.drugData.lipinskiRuleOf5.passesRuleOfFive
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {resolvedData.drugData.lipinskiRuleOf5.passesRuleOfFive
                            ? 'PASSES RULE OF 5'
                            : `${resolvedData.drugData.lipinskiRuleOf5.violationsCount} VIOLATIONS`}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-1.5 text-xs">
                        {resolvedData.drugData.lipinskiRuleOf5.rules.map((rule, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between bg-slate-50 px-3 py-1.5 rounded border border-slate-200"
                          >
                            <span className="text-slate-700">{rule.name}</span>
                            <div className="flex items-center gap-3 font-mono">
                              <span className="text-slate-900 font-semibold">{rule.value}</span>
                              <span className="text-slate-500 text-[11px]">({rule.threshold})</span>
                              {rule.passed ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* openFDA Boxed Warning & Canonical SMILES */}
                  <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                    <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-amber-950 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-amber-900">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                        <span>openFDA Drug Safety Notice &amp; Boxed Warning:</span>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        {resolvedData.drugData.openFdaSafety.boxedWarning}
                      </p>
                    </div>

                    <div className="p-2.5 bg-slate-900 text-teal-300 rounded font-mono text-[11px] overflow-x-auto truncate">
                      SMILES: {resolvedData.drugData.canonicalSmiles}
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Genomic Variants & ClinVar / AlphaGenome Atlas */}
              {resolvedData.variantData && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <div className="flex items-center gap-2">
                      <Atom className="w-5 h-5 text-teal-700" />
                      <div>
                        <h4 className="text-base font-bold text-slate-900">
                          Genomic Variant &amp; Clinical Significance
                        </h4>
                        <span className="text-xs text-slate-500 font-mono">
                          {resolvedData.variantData.variantIdentifier}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={resolvedData.variantData.clinVarUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
                      >
                        <span>NCBI ClinVar</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <a
                        href={resolvedData.variantData.alphaGenomeAtlasUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-900 hover:text-slate-700"
                      >
                        <span>AlphaGenome Atlas</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="text-slate-500 text-[11px] font-mono">ACMG Clinical Classification</div>
                      <div className="font-bold text-slate-900 text-sm mt-0.5">
                        {resolvedData.variantData.clinicalSignificance}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="text-slate-500 text-[11px] font-mono">ClinVar Review Status</div>
                      <div className="font-bold text-slate-900 text-sm mt-0.5">
                        {resolvedData.variantData.reviewStatus}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 4. Europe PMC Peer-Reviewed Articles */}
              {resolvedData.literatureArticles.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-teal-700" />
                      <h4 className="text-base font-bold text-slate-900">
                        Peer-Reviewed Literature (Europe PMC &amp; PubMed)
                      </h4>
                    </div>
                    <span className="text-xs font-mono text-slate-500">
                      {resolvedData.literatureArticles.length} recent articles
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {resolvedData.literatureArticles.map((art, idx) => (
                      <a
                        key={idx}
                        href={art.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors text-xs"
                      >
                        <div className="font-semibold text-slate-900">{art.title}</div>
                        <div className="flex items-center justify-between text-slate-500 text-[11px] font-mono mt-1">
                          <span>
                            {art.journal} ({art.pubYear})
                          </span>
                          <span className="text-teal-700">PMID: {art.pmid}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Column (5 cols): Gemini 3.8 Flash Search Grounded Report & Citations */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs font-mono text-teal-700 font-semibold">
                  DEEP SCIENTIFIC SYNTHESIS · GEMINI 3.8 FLASH
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  Google Search Grounded Scientific Intelligence
                </h3>
              </div>
              {analysisReport && (
                <span className="text-xs font-mono text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded">
                  {analysisReport.latencyMs} ms
                </span>
              )}
            </div>

            {analyzing ? (
              <div className="space-y-3 py-6 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-3/4" />
                <div className="h-20 bg-slate-100 rounded w-full" />
                <div className="h-4 bg-slate-200 rounded w-1/2" />
                <div className="h-24 bg-slate-100 rounded w-full" />
                <div className="text-xs text-center text-teal-700 font-mono">
                  Grounding with Google Search &amp; synthesizing bioscience mechanisms...
                </div>
              </div>
            ) : analysisReport ? (
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs leading-relaxed text-slate-900 whitespace-pre-line">
                  {renderBioScienceTextWithCitations(analysisReport.analysis, analysisReport.citations)}
                </div>

                {analysisReport.searchQueries && analysisReport.searchQueries.length > 0 && (
                  <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1.5 text-xs">
                    <div className="text-slate-500 font-mono text-[11px] font-semibold">
                      GOOGLE SEARCH GROUNDING QUERIES EXECUTED:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {analysisReport.searchQueries.map((q, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-700 font-mono text-[11px]"
                        >
                          {q}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {analysisReport.citations && analysisReport.citations.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <ExternalLink className="w-3.5 h-3.5 text-teal-700" />
                        Verified Google Search Grounding Sources ({analysisReport.citations.length})
                      </span>
                      <span className="text-[11px] font-mono text-teal-700">Click to visit ↗</span>
                    </div>

                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {analysisReport.citations.map((cit, idx) => {
                        const sourceUrl = getSafeCitationUrl(cit.uri, cit.title);
                        return (
                          <a
                            key={cit.id || cit.uri || idx}
                            href={sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group block p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-teal-600 rounded-lg text-xs transition-colors shadow-2xs"
                            title={`Open source: ${sourceUrl}`}
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <span className="font-semibold text-slate-900 group-hover:text-teal-900 line-clamp-1">
                                [{idx + 1}] {cit.title}
                              </span>
                              <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-600 shrink-0 mt-0.5" />
                            </div>
                            <div className="flex items-center justify-between text-slate-500 text-[11px] font-mono mt-1">
                              <span className="text-teal-700 font-bold">{cit.authorityTier.replace(/_/g, ' ')}</span>
                              <span className="group-hover:underline">{cit.organization} · Visit ↗</span>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-500 space-y-2">
                <Compass className="w-6 h-6 text-slate-400 mx-auto" />
                <p>Click &ldquo;Explore Target&rdquo; above to generate a search-grounded scientific synthesis.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const BioScienceModule = React.memo(BioScienceModuleComponent);
