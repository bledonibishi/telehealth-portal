'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { format } from 'date-fns';
import { MY_WEIGHT_JOURNEY, SET_MY_TARGET_WEIGHT, MY_WEIGHT_TREND } from '@/graphql/weight';
import { kg, targetPlan } from '@/lib/weight';

/** What the typed target means: how much to lose, a steady-pace date range and where they stand on the way. */
function TargetPreview({ currentKg, startKg, targetKg }: { currentKg: number; startKg?: number | null; targetKg: number }) {
  const plan = targetPlan(currentKg, targetKg, startKg, new Date());
  if (plan.kind === 'AT_OR_ABOVE') {
    return <p className="text-xs text-slate-500">That is at or above your current weight ({kg(currentKg)}). Choose a lower number if you want to lose weight.</p>;
  }
  const from = format(plan.fastestAt, 'MMM yyyy');
  const to = format(plan.slowestAt, 'MMM yyyy');
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-2" aria-live="polite">
      <p className="text-sm font-medium text-slate-900">You’d lose {kg(plan.toLoseKg)} to reach {kg(targetKg)}.</p>
      <p className="text-xs text-slate-500">
        At a steady 0.5–1 kg a week that’s around {from === to ? from : `${from} – ${to}`}. A rough guide, not a promise — your doctor sets your plan.
      </p>
      {plan.percent !== null && startKg != null && (
        <div>
          <div className="h-2 rounded-full bg-slate-200 overflow-hidden" role="img" aria-label={`${Math.round(plan.percent)}% of the way from ${kg(startKg)} to ${kg(targetKg)}`}>
            <div className="h-full bg-brand-500 rounded-full" style={{ width: `${plan.percent}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-slate-400 mt-1"><span>{kg(startKg)}</span><span>🎯 {kg(targetKg)}</span></div>
        </div>
      )}
    </div>
  );
}

/** `currentKg` and `startKg` (when known) let the form say what the typed target means before it is saved. */
export function TargetWeightForm({ current, currentKg, startKg, onDone }: { current?: number | null; currentKg?: number | null; startKg?: number | null; onDone?: () => void }) {
  const [value, setValue] = useState(current ? String(current) : '');
  const [save, { loading, error }] = useMutation(SET_MY_TARGET_WEIGHT, {
    // The result has no `id` to normalise on, so re-read the journey the dashboard shows.
    // The trend too: where a steady loss leads depends on the target.
    refetchQueries: [{ query: MY_WEIGHT_JOURNEY }, { query: MY_WEIGHT_TREND }],
    awaitRefetchQueries: true,
  });

  const n = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(n) && n > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    try {
      await save({ variables: { targetWeightKg: n } });
      onDone?.();
    } catch {
      // Shown below from `error`.
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor="target-weight" className="block text-sm font-medium text-slate-900">
        What&rsquo;s your target weight?
      </label>
      <div className="flex items-center gap-2">
        <input
          id="target-weight"
          type="number"
          inputMode="decimal"
          step="any"
          min={30}
          max={300}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-28 border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <span className="text-sm text-slate-500">kg</span>
        <button
          type="submit"
          disabled={!valid || loading}
          className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl"
        >
          {loading ? 'Saving…' : 'Save'}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="text-sm text-slate-400 hover:text-slate-600">
            Cancel
          </button>
        )}
      </div>
      {valid && currentKg != null && <TargetPreview currentKg={currentKg} startKg={startKg} targetKg={n} />}
      {error && <p className="text-xs text-danger-500">{error.message}</p>}
    </form>
  );
}
