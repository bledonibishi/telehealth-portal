'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { PATIENT_LAB_RESULTS, PATIENT_TRT_MONITORING, RECORD_LAB_RESULT } from '@/graphql/labs';
import { DEFAULT_UNIT, KIND_LABEL } from './labs-format';
import { format } from 'date-fns';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { InlineError } from '@/components/ui/Alert';
import { Select } from '@/components/ui/Select';

const inputCls = 'border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

/** Enter a result from a lab report. Out-of-range values are flagged for review automatically. */
export function RecordLabResultForm({ patientId, defaultKind = 'TESTOSTERONE', onDone }: { patientId: string; defaultKind?: string; onDone: () => void }) {
  const { t, fmt } = useI18n();
  const [kind, setKind] = useState(defaultKind);
  const [analyteName, setAnalyteName] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState(DEFAULT_UNIT[defaultKind] ?? '');
  const [low, setLow] = useState('');
  const [high, setHigh] = useState('');
  const [collectedOn, setCollectedOn] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [error, setError] = useState<unknown>(null);
  const [record, { loading }] = useMutation(RECORD_LAB_RESULT, {
    refetchQueries: [{ query: PATIENT_LAB_RESULTS, variables: { patientId } }, { query: PATIENT_TRT_MONITORING, variables: { patientId } }],
    awaitRefetchQueries: true,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(Number(value)) || value.trim() === '') return setError(t('Enter the result value.'));
    if (!unit.trim()) return setError(t('Enter the unit.'));
    setError(null);
    try {
      await record({
        variables: {
          input: {
            patientId,
            kind,
            analyteName: kind === 'OTHER' ? analyteName : undefined,
            value: Number(value),
            unit: unit.trim(),
            referenceRangeLow: num(low),
            referenceRangeHigh: num(high),
            collectedAt: new Date(`${collectedOn}T09:00:00`).toISOString(),
          },
        },
      });
      onDone();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <form onSubmit={submit} className="bg-gray-50 rounded-md p-4 space-y-3">
      <div className="flex flex-wrap gap-3">
        <label className="text-xs text-gray-500">
          {t('Test')}
          <div className="mt-1"><Select ariaLabel={t('Test')} value={kind} onChange={(v) => { setKind(v); setUnit(DEFAULT_UNIT[v] ?? ''); }} options={Object.entries(KIND_LABEL).map(([k, l]) => ({ value: k, label: l }))} /></div>
        </label>
        {kind === 'OTHER' && (
          <label className="text-xs text-gray-500">
            {t('What was measured')}
            <input value={analyteName} onChange={(e) => setAnalyteName(e.target.value)} className={`${inputCls} block mt-1 w-40`} />
          </label>
        )}
        <label className="text-xs text-gray-500">
          {t('Result')}
          <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" className={`${inputCls} block mt-1 w-24`} />
        </label>
        <label className="text-xs text-gray-500">
          {t('Unit')}
          <input value={unit} onChange={(e) => setUnit(e.target.value)} className={`${inputCls} block mt-1 w-24`} />
        </label>
        <label className="text-xs text-gray-500">
          {t('Range (low–high)')}
          <span className="flex gap-1 mt-1">
            <input value={low} onChange={(e) => setLow(e.target.value)} inputMode="decimal" placeholder="low" className={`${inputCls} w-20`} />
            <input value={high} onChange={(e) => setHigh(e.target.value)} inputMode="decimal" placeholder="high" className={`${inputCls} w-20`} />
          </span>
        </label>
        <label className="text-xs text-gray-500">
          {t('Collected on')}
          <input type="date" value={collectedOn} max={format(new Date(), 'yyyy-MM-dd')} onChange={(e) => setCollectedOn(e.target.value)} className={`${inputCls} block mt-1`} />
        </label>
      </div>
      <InlineError error={error} size="xs" />
      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="bg-brand-500 hover:bg-brand-900 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg">
          {loading ? t('Saving…') : t('Save result')}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-gray-500 hover:text-gray-700">{t('Cancel')}</button>
      </div>
    </form>
  );
}
