import React, { useState, useEffect, useRef } from 'react';
import {
  Languages,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  MessageSquare,
} from 'lucide-react';
import { SAMPLE_HEALTH_ACCESS_SNIPPETS } from '../shared/sampleData';
import {
  STORAGE_KEYS,
  readLocalStorage,
  writeLocalStorage,
  HealthAccessCachedState,
} from '../lib/storageCache';

interface GlossaryItem {
  term: string;
  simpleMeaningEn: string;
  simpleMeaningTe: string;
}

interface HealthAccessResult {
  plainLanguageExplanation: string;
  translatedVersion: string;
  englishKeyPoints: string[];
  teluguKeyPoints: string[];
  glossary: GlossaryItem[];
  preservedUnitsAndWarnings: string[];
  ambiguitiesFlagged: string[];
  followUpAnswer: string;
  verificationWarningEn: string;
  verificationWarningTe: string;
}

interface HealthAccessModuleProps {
  language: 'en' | 'te';
  prefilledText?: string;
}

const HealthAccessModuleComponent: React.FC<HealthAccessModuleProps> = ({
  language,
  prefilledText = '',
}) => {
  const cachedState = useRef<HealthAccessCachedState | null>(
    readLocalStorage<HealthAccessCachedState | null>(STORAGE_KEYS.HEALTHACCESS_STATE, null)
  ).current;

  const [sourceText, setSourceText] = useState(
    () => prefilledText || cachedState?.sourceText || SAMPLE_HEALTH_ACCESS_SNIPPETS[0].text
  );
  const [sourceLanguage, setSourceLanguage] = useState<'en' | 'te'>(
    () => cachedState?.sourceLanguage || 'en'
  );
  const [targetLanguage, setTargetLanguage] = useState<'en' | 'te'>(
    () => cachedState?.targetLanguage || (language === 'te' ? 'te' : 'te')
  );
  const [mode, setMode] = useState<'simplify_and_translate' | 'simplify_only' | 'translate_only'>(
    () => cachedState?.mode || 'simplify_and_translate'
  );
  const [followUpQuestion, setFollowUpQuestion] = useState(
    () => cachedState?.followUpQuestion || ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HealthAccessResult | null>(
    () => cachedState?.result || null
  );

  useEffect(() => {
    if (prefilledText && prefilledText.trim().length > 0) {
      setSourceText(prefilledText);
    }
  }, [prefilledText]);

  useEffect(() => {
    writeLocalStorage<HealthAccessCachedState>(STORAGE_KEYS.HEALTHACCESS_STATE, {
      sourceText,
      sourceLanguage,
      targetLanguage,
      mode,
      followUpQuestion,
      result,
    });
  }, [sourceText, sourceLanguage, targetLanguage, mode, followUpQuestion, result]);

  const handleProcess = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!sourceText.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/health-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sourceText,
          sourceLanguage,
          targetLanguage,
          mode,
          followUpQuestion: followUpQuestion.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Unable to process multilingual health communication.');
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error communicating with HealthAccess.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Module Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="text-xs font-medium text-teal-700 mb-1">
              02. HealthAccess · Bilingual English &amp; Telugu (తెలుగు) Communication
            </div>
            <h2 className="text-2xl font-bold text-slate-900">
              Multilingual Medical Simplification &amp; Translation
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              Rewrites complex clinical instructions and public health material into clear everyday English and Telugu while strictly preserving numerical dosages, measurement units, and clinical warnings.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {SAMPLE_HEALTH_ACCESS_SNIPPETS.map((snippet) => (
              <button
                key={snippet.id}
                type="button"
                onClick={() => {
                  setSourceText(snippet.text);
                  setError(null);
                }}
                className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                Load: {snippet.title.split(' ')[0]} {snippet.title.split(' ')[1]}
              </button>
            ))}
          </div>
        </div>

        {/* Mandatory Professional Translation Warning */}
        <div className="pt-4 flex items-start gap-2.5 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Professional Verification Notice: </span>
            Important medical translations, discharge instructions, and medication schedules may require verification by a qualified healthcare professional or certified medical interpreter.
            <span className="block text-slate-600 mt-0.5">
              ముఖ్య గమనిక: మందుల మోతాదులు మరియు వైద్య సూచనల అనువాదాన్ని తప్పనిసరిగా అర్హత కలిగిన వైద్యుడితో ధృవీకరించుకోండి.
            </span>
          </div>
        </div>
      </div>

      {/* Input & Output Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Input Controls */}
        <form onSubmit={handleProcess} className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Source Language
              </label>
              <select
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value as 'en' | 'te')}
                className="w-full px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
              >
                <option value="en">English (en)</option>
                <option value="te">Telugu — తెలుగు (te)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Output Language
              </label>
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value as 'en' | 'te')}
                className="w-full px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
              >
                <option value="te">Telugu — తెలుగు (te)</option>
                <option value="en">English (en)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Communication Task
            </label>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-lg">
              {[
                { id: 'simplify_and_translate', label: 'Simplify + Translate' },
                { id: 'simplify_only', label: 'Plain Wording' },
                { id: 'translate_only', label: 'Direct Translate' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMode(tab.id as typeof mode)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate ${
                    mode === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="healthaccess-textarea" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Approved Health Information or Clinical Text
            </label>
            <textarea
              id="healthaccess-textarea"
              rows={7}
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Paste health education text, discharge summary instructions, or medical terminology..."
              className="w-full p-3 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div>
            <label htmlFor="healthaccess-followup" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Optional Follow-Up Question (in English or తెలుగు)
            </label>
            <div className="relative">
              <MessageSquare className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                id="healthaccess-followup"
                type="text"
                value={followUpQuestion}
                onChange={(e) => setFollowUpQuestion(e.target.value)}
                placeholder="e.g., ఈ మందు ఆహారంతో తీసుకోవాలా? / Can children take this?"
                className="w-full pl-9 pr-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || sourceText.trim().length < 3}
            className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            <Languages className="w-4 h-4" />
            <span>
              {loading
                ? 'Simplifying & Translating...'
                : targetLanguage === 'te'
                ? 'Simplify & Translate to Telugu (తెలుగు)'
                : 'Simplify & Explain in Plain English'}
            </span>
          </button>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
              {error}
            </div>
          )}
        </form>

        {/* Right: Structured Bilingual Output */}
        <div className="lg:col-span-7 space-y-6">
          {!result && !loading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
              <BookOpen className="w-8 h-8 text-teal-700 mx-auto" />
              <h3 className="text-base font-semibold text-slate-900">
                Ready for English &amp; Telugu Medical Simplification
              </h3>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                Click &ldquo;Simplify &amp; Translate&rdquo; on the left to generate a plain-language explanation, Telugu translation, preserved dosage audit, and bilingual medical glossary.
              </p>
            </div>
          ) : loading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 animate-pulse">
              <div className="h-5 bg-slate-200 rounded w-1/3" />
              <div className="h-20 bg-slate-100 rounded w-full" />
              <div className="h-5 bg-slate-200 rounded w-1/4" />
              <div className="h-24 bg-slate-100 rounded w-full" />
            </div>
          ) : (
            result && (
              <div className="space-y-6">
                {/* Primary Plain-Language & Translated Cards */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div>
                    <div className="text-xs font-semibold text-teal-700 mb-1">
                      PLAIN-LANGUAGE EXPLANATION ({targetLanguage === 'te' ? 'తెలుగు' : 'ENGLISH'})
                    </div>
                    <p className="text-sm text-slate-900 leading-relaxed whitespace-pre-line">
                      {result.plainLanguageExplanation}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-200">
                    <div className="text-xs font-semibold text-slate-700 mb-1">
                      FAITHFUL TRANSLATION ({targetLanguage === 'te' ? 'తెలుగు అనువాదం' : 'ENGLISH TRANSLATION'})
                    </div>
                    <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">
                      {result.translatedVersion}
                    </p>
                  </div>

                  {result.followUpAnswer && (
                    <div className="p-4 bg-teal-50/60 border border-teal-200 rounded-lg space-y-1">
                      <div className="text-xs font-semibold text-teal-900">
                        Follow-Up Question Response:
                      </div>
                      <p className="text-sm text-slate-900">{result.followUpAnswer}</p>
                    </div>
                  )}
                </div>

                {/* Side-by-Side English & Telugu Key Takeaways */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
                    <h4 className="text-xs font-bold text-slate-900">
                      Key Takeaways (Plain English)
                    </h4>
                    <ul className="space-y-2 text-xs text-slate-700">
                      {result.englishKeyPoints.map((pt, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="font-mono text-teal-700 font-semibold">{i + 1}.</span>
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
                    <h4 className="text-xs font-bold text-slate-900">
                      ముఖ్య అంశాలు (Telugu Key Points)
                    </h4>
                    <ul className="space-y-2 text-xs text-slate-700">
                      {result.teluguKeyPoints.map((pt, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="font-mono text-teal-700 font-semibold">{i + 1}.</span>
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Preserved Units, Numbers & Warnings Audit */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-teal-700" />
                      <span>Preserved Units, Dosages &amp; Clinical Warnings</span>
                    </h4>
                    <span className="text-xs font-mono text-slate-500">Zero-Distortion Check</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {result.preservedUnitsAndWarnings.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bilingual Terminology Glossary */}
                {result.glossary && result.glossary.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50">
                      <h4 className="text-sm font-bold text-slate-900">
                        Medical Terminology Explained (English &amp; తెలుగు)
                      </h4>
                    </div>
                    <div className="divide-y divide-slate-200">
                      {result.glossary.map((g, i) => (
                        <div key={i} className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                          <div className="font-semibold text-slate-900 font-mono">{g.term}</div>
                          <div className="text-slate-700">{g.simpleMeaningEn}</div>
                          <div className="text-slate-800">{g.simpleMeaningTe}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ambiguities Flagged */}
                {result.ambiguitiesFlagged && result.ambiguitiesFlagged.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1.5 text-xs text-amber-900">
                    <div className="font-bold">Ambiguous Phrases Flagged for Clinician Verification:</div>
                    <ul className="list-disc pl-4 space-y-1">
                      {result.ambiguitiesFlagged.map((amb, i) => (
                        <li key={i}>{amb}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export const HealthAccessModule = React.memo(HealthAccessModuleComponent);
