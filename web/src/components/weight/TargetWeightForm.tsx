'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { MY_WEIGHT_JOURNEY, SET_MY_TARGET_WEIGHT } from '@/graphql/weight';

export function TargetWeightForm({ current, onDone }: { current?: number | null; onDone?: () => void }) {
  const [value, setValue] = useState(current ? String(current) : '');
  const [save, { loading, error }] = useMutation(SET_MY_TARGET_WEIGHT, {
    // The result has no `id` to normalise on, so re-read the journey the dashboard shows.
    refetchQueries: [{ query: MY_WEIGHT_JOURNEY }],
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
      {error && <p className="text-xs text-danger-500">{error.message}</p>}
    </form>
  );
}
