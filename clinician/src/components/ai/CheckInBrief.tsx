'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { GENERATE_CHECK_IN_BRIEF } from '@/graphql/ai';
import { useAiFeature } from '@/lib/ai';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { InlineError } from '@/components/ui/Alert';
import { AiMark } from './AiMark';

type Brief = {
  headline: string;
  removed: number;
  model: string;
  generatedAt: string;
  cached: boolean;
  bullets: Array<{ text: string; importance: string; sources: Array<{ id: string; label: string; text: string }> }>;
};

/**
 * A short brief of a completed check-in, written by AI from the record, for the doctor reviewing it. Every bullet shows the
 * lines of the record it rests on (hover or tap a tag), anything it couldn't back up is left out, and it never recommends
 * a decision: that stays with the doctor.
 */
export function CheckInBrief({ checkInId }: { checkInId: string }) {
  const { t, locale, timeAgo } = useI18n();
  const enabled = useAiFeature('brief');
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [generate, { loading }] = useMutation(GENERATE_CHECK_IN_BRIEF, { onError: setError, onCompleted: (d) => setBrief(d.generateCheckInBrief) });

  if (!enabled) return null;
  const run = (force: boolean) => { setError(null); generate({ variables: { checkInId, language: locale, force } }); };

  return (
    <section className="rounded-lg border border-violet-200 bg-gradient-to-br from-violet-50/70 to-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{t('Brief')}</h3>
          <AiMark />
        </div>
        {!brief ? (
          <button type="button" onClick={() => run(false)} disabled={loading} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
            {loading ? t('Writing the brief…') : t('Summarise this check-in')}
          </button>
        ) : (
          <button type="button" onClick={() => run(true)} disabled={loading} className="text-xs text-violet-700 hover:underline disabled:opacity-50">
            {loading ? t('Writing the brief…') : t('Write it again')}
          </button>
        )}
      </div>

      {!brief && !loading && !error && <p className="text-xs text-gray-500 mt-2">{t('A short summary of what changed and what stands out, with the record lines it rests on. It never recommends a decision.')}</p>}
      <InlineError error={error} size="xs" className="mt-2" />

      {brief && (
        <div className="mt-3 space-y-3">
          <p className="text-sm font-medium text-gray-900">{brief.headline}</p>
          <ul className="space-y-2">
            {brief.bullets.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-800">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${b.importance === 'high' ? 'bg-amber-500' : 'bg-gray-300'}`} aria-hidden />
                <div className="min-w-0">
                  <p>{b.text}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {b.sources.map((s) => {
                      const key = `${i}-${s.id}`;
                      return (
                        <button key={s.id} type="button" onClick={() => setOpen(open === key ? null : key)} title={s.text} className={`text-[11px] px-1.5 py-0.5 rounded border ${open === key ? 'bg-violet-100 border-violet-300 text-violet-800' : 'bg-white border-gray-200 text-gray-500 hover:border-violet-300'}`}>
                          {t(s.label)}
                        </button>
                      );
                    })}
                  </div>
                  {b.sources.filter((s) => open === `${i}-${s.id}`).map((s) => <p key={s.id} className="text-xs text-gray-500 mt-1 rounded bg-white border border-gray-100 px-2 py-1">{s.text}</p>)}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-gray-400">
            {t('Written by AI from the record {when}. Check it against the details below.', { when: timeAgo(brief.generatedAt) })}
            {brief.removed > 0 && ` ${brief.removed === 1 ? t('1 line was left out because it couldn’t be checked.') : t('{n} lines were left out because they couldn’t be checked.', { n: brief.removed })}`}
          </p>
        </div>
      )}
    </section>
  );
}
