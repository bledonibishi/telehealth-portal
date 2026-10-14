'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { INTERPRET_PATIENT_SEARCH } from '@/graphql/ai';
import { useAiFeature } from '@/lib/ai';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { InlineError } from '@/components/ui/Alert';
import { AiMark } from './AiMark';

export type SmartFilters = {
  programme?: string | null;
  status?: string | null;
  reviewStatus?: string | null;
  bmiRange?: string | null;
  joined?: string | null;
  quick?: string | null;
  medication?: string | null;
  text?: string | null;
};

const VALUE_LABEL: Record<string, Record<string, string>> = {
  programme: { HRT: 'HRT', GLP1: 'GLP-1', TRT: 'TRT' },
  status: { ACTIVE: 'On treatment', INACTIVE: 'Not on treatment', DECLINED: 'Declined', PENDING: 'Not activated yet' },
  reviewStatus: { NONE: 'No consultation', SUBMITTED: 'New', IN_REVIEW: 'In review', MORE_INFO_REQUESTED: 'Awaiting info', APPROVED: 'Approved', DECLINED: 'Declined' },
  bmiRange: { '25-30': 'BMI 25 to 30', '30-35': 'BMI 30 to 35', '35+': 'BMI 35 and over', NONE: 'No BMI yet' },
  joined: { WEEK: 'Joined in the last 7 days', MONTH: 'Joined in the last 30 days', QUARTER: 'Joined in the last 3 months' },
  quick: { ACTIVE: 'On treatment', REVIEW: 'Waiting for a doctor', TARGET: 'Reached their goal weight', REPLY: 'Waiting for a reply' },
};

/**
 * "Ask in plain words": turns a sentence into the patients list's own filters. The AI sees only what is typed, never a
 * patient's data, and the filters it picks appear as tags you can see and clear, so you always know what the list is showing.
 */
export function SmartPatientSearch({ medicationOptions, onApply, onReset }: { medicationOptions: string[]; onApply: (f: SmartFilters) => void; onReset: () => void }) {
  const { t } = useI18n();
  const enabled = useAiFeature('search');
  const [text, setText] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [unsupported, setUnsupported] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [interpret, { loading }] = useMutation(INTERPRET_PATIENT_SEARCH, {
    onError: setError,
    onCompleted: ({ interpretPatientSearch: r }) => {
      const f: SmartFilters = { ...r };
      // A medicine only counts when the list really has it; otherwise it is said, not silently dropped.
      const missing: string[] = [];
      if (f.medication) {
        const match = medicationOptions.find((m) => m.toLowerCase().includes(f.medication!.toLowerCase()));
        if (match) f.medication = match;
        else { missing.push(t('No patient is on “{medicine}”', { medicine: f.medication })); f.medication = null; }
      }
      const chips: string[] = [];
      for (const key of Object.keys(VALUE_LABEL)) {
        const v = (f as Record<string, string | null | undefined>)[key];
        if (v) chips.push(t(VALUE_LABEL[key][v] ?? v));
      }
      if (f.medication) chips.push(f.medication);
      if (f.text) chips.push(`“${f.text}”`);
      setTags(chips);
      setUnsupported([...missing, ...r.unsupported]);
      onApply(f);
    },
  });
  if (!enabled) return null;

  const run = () => {
    if (text.trim().length < 3 || loading) return;
    setError(null);
    interpret({ variables: { query: text.trim() } });
  };
  const clear = () => { setText(''); setTags([]); setUnsupported([]); setError(null); onReset(); };

  return (
    <div className="shrink-0 space-y-1.5">
      <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-1.5 transition-shadow focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-200">
        <AiMark />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } }}
          placeholder={t('Ask in plain words, e.g. “HRT patients waiting for a reply”')}
          aria-label={t('Ask in plain words')}
          maxLength={300}
          className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-gray-400"
        />
        <button type="button" onClick={run} disabled={loading || text.trim().length < 3} className="text-xs font-medium px-3 py-1 rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40">
          {loading ? t('Looking…') : t('Find')}
        </button>
        {(tags.length > 0 || text) && <button type="button" onClick={clear} className="text-xs text-gray-500 hover:text-gray-800 underline">{t('Clear')}</button>}
      </div>
      {tags.length > 0 && (
        <p className="text-xs text-gray-500 flex flex-wrap items-center gap-1.5">
          {t('Showing')}:
          {tags.map((c) => <span key={c} className="rounded-full bg-violet-100 text-violet-800 px-2 py-0.5">{c}</span>)}
        </p>
      )}
      {tags.length === 0 && unsupported.length === 0 && !error && text && !loading && null}
      {unsupported.length > 0 && <p className="text-xs text-amber-700">{t('Couldn’t turn this into a filter:')} {unsupported.join('; ')}</p>}
      <InlineError error={error} size="xs" />
    </div>
  );
}
