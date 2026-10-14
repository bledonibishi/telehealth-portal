'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { PATIENT_DASHBOARD_CARDS, SET_PATIENT_DASHBOARD_CARD } from '@/graphql/assistant';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { InlineError } from '@/components/ui/Alert';
import { Select } from '@/components/ui/Select';

type Card = { id: string; title: string; state: 'SHOWING' | 'HIDDEN_BY_PATIENT' | 'HIDDEN_BY_SUPPORT' | 'SHOWN_BY_SUPPORT'; canHide: boolean; until: string | null; reason: string | null };

const DAYS = [1, 3, 7, 14, 30];

/**
 * What is on this patient's home screen, for support: hide a card for a while (to simplify it, or because they asked), or bring
 * back one they took off. Every change ends by itself, needs a reason and is recorded. Treatment and emergency cards can't be
 * hidden by support; the patient's own arrangement is never changed.
 */
export default function PatientDashboardCards({ patientId }: { patientId: string }) {
  const { t, fmt } = useI18n();
  const { data, loading } = useQuery(PATIENT_DASHBOARD_CARDS, { variables: { patientId }, fetchPolicy: 'cache-and-network' });
  const cards: Card[] = data?.patientDashboardCards ?? [];
  const [open, setOpen] = useState<{ id: string; action: 'HIDE' | 'SHOW' } | null>(null);
  const [days, setDays] = useState('7');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);

  const [setCard, { loading: saving }] = useMutation(SET_PATIENT_DASHBOARD_CARD, {
    update(cache, { data: d }) { if (d) cache.writeQuery({ query: PATIENT_DASHBOARD_CARDS, variables: { patientId }, data: { patientDashboardCards: d.setPatientDashboardCard } }); },
    onError: setError,
    onCompleted: () => { setError(null); setOpen(null); setReason(''); },
  });
  const run = (cardId: string, action: 'HIDE' | 'SHOW' | 'CLEAR') => setCard({ variables: { input: { patientId, cardId, action, days: action === 'CLEAR' ? undefined : Number(days), reason: action === 'CLEAR' ? undefined : reason.trim() } } });

  const label: Record<Card['state'], { text: string; cls: string }> = {
    SHOWING: { text: 'Showing', cls: 'bg-green-50 text-green-700' },
    HIDDEN_BY_PATIENT: { text: 'Removed by the patient', cls: 'bg-gray-100 text-gray-600' },
    HIDDEN_BY_SUPPORT: { text: 'Hidden by support', cls: 'bg-amber-50 text-amber-700' },
    SHOWN_BY_SUPPORT: { text: 'Shown by support', cls: 'bg-blue-50 text-blue-700' },
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('Their home screen')}</h2>
        <p className="text-sm text-gray-500 mt-1">{t('Hide a card for a while, or bring back one they removed. It ends by itself, and their own arrangement is never changed.')}</p>
      </div>
      <InlineError error={error} />
      {loading && cards.length === 0 ? (
        <p className="text-sm text-gray-400">{t('Loading…')}</p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {cards.map((c) => (
            <li key={c.id} className="px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 truncate">{c.title}</p>
                  <span className={`inline-block mt-0.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${label[c.state].cls}`}>{t(label[c.state].text)}{c.until ? ` · ${t('until')} ${fmt(c.until, 'd MMM')}` : ''}</span>
                </div>
                <div className="shrink-0">
                  {(c.state === 'HIDDEN_BY_SUPPORT' || c.state === 'SHOWN_BY_SUPPORT') && (
                    <button type="button" disabled={saving} onClick={() => run(c.id, 'CLEAR')} className="text-xs font-medium border border-gray-300 text-gray-700 bg-white rounded-lg px-2.5 py-1 hover:bg-gray-50">{t('Lift')}</button>
                  )}
                  {c.state === 'SHOWING' && c.canHide && (
                    <button type="button" onClick={() => setOpen({ id: c.id, action: 'HIDE' })} className="text-xs font-medium border border-gray-300 text-gray-700 bg-white rounded-lg px-2.5 py-1 hover:bg-gray-50">{t('Hide for a while')}</button>
                  )}
                  {c.state === 'SHOWING' && !c.canHide && <span className="text-[11px] text-gray-400" title={t('Treatment and safety information: support can’t hide it')}>{t('Always shown')}</span>}
                  {c.state === 'HIDDEN_BY_PATIENT' && (
                    <button type="button" onClick={() => setOpen({ id: c.id, action: 'SHOW' })} className="text-xs font-medium border border-gray-300 text-gray-700 bg-white rounded-lg px-2.5 py-1 hover:bg-gray-50">{t('Show it')}</button>
                  )}
                </div>
              </div>
              {c.reason && <p className="text-xs text-gray-400 mt-1">“{c.reason}”</p>}
              {open?.id === c.id && (
                <form className="mt-2 space-y-2 bg-gray-50 rounded-lg p-3" onSubmit={(e) => { e.preventDefault(); run(c.id, open.action); }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">{open.action === 'HIDE' ? t('Hide it for') : t('Show it for')}</span>
                    <div className="w-32"><Select size="sm" value={days} onChange={setDays} ariaLabel={t('Days')} options={DAYS.map((d) => ({ value: String(d), label: d === 1 ? t('1 day') : t('{n} days', { n: d }) }))} /></div>
                  </div>
                  <input required minLength={5} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('Why? (kept in the audit log)')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" />
                  <div className="flex items-center gap-3">
                    <button type="submit" disabled={saving || reason.trim().length < 5} className="bg-brand-500 text-white rounded-lg px-3.5 py-1.5 text-sm font-medium disabled:opacity-50">{saving ? t('Working…') : t('Do it')}</button>
                    <button type="button" onClick={() => setOpen(null)} className="text-sm text-gray-500 hover:text-gray-800">{t('Cancel')}</button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
