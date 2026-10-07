'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import {
  CORRECT_CHECK_IN_WEIGHT, CORRECT_WEIGHT_ENTRY, CORRECT_WEIGHT_GOAL, GET_WEIGHT_JOURNEY, GET_WEIGHT_TIMELINE, VOID_WEIGHT_ENTRY,
} from '@/graphql/weight';
import { FEELINGS, kg, kgChange as rawKgChange } from '@/lib/weight';
import { useI18n } from '@/lib/i18n/I18nProvider';
import ProgressPhotos from './ProgressPhotos';

const inputCls = 'border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2.5">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

/** A small "new value + reason" form used for both goal and check-in corrections. */
function CorrectionForm({
  fields, saving, error, onSave, onCancel, requireReason = false,
}: {
  requireReason?: boolean;
  fields: { key: string; label: string; initial: string }[];
  saving: boolean;
  error?: string;
  onSave: (values: Record<string, number>, reason: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState(Object.fromEntries(fields.map((f) => [f.key, f.initial])));
  const [reason, setReason] = useState('');
  const valid = fields.every((f) => Number(values[f.key]) > 0) && (!requireReason || reason.trim().length > 0);

  return (
    <div className="mt-2 space-y-2 bg-amber-50 border border-amber-100 rounded-xl p-3">
      <div className="flex flex-wrap gap-3">
        {fields.map((f) => (
          <label key={f.key} className="text-xs text-gray-500">
            {f.label} (kg)
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className={`${inputCls} block w-28 mt-0.5`}
            />
          </label>
        ))}
      </div>
      <input
        placeholder={requireReason ? t('Reason (required — kept in the audit log)') : t('Reason for the correction (kept in the audit log)')}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className={`${inputCls} w-full`}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          disabled={!valid || saving}
          onClick={() => onSave(Object.fromEntries(fields.map((f) => [f.key, Number(values[f.key])])), reason.trim())}
          className="px-3 py-1 text-xs font-medium rounded-lg bg-amber-500 text-white disabled:opacity-40"
        >
          {saving ? t('Saving…') : t('Save correction')}
        </button>
        <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">{t('Cancel')}</button>
      </div>
    </div>
  );
}

export default function WeightJourneyPanel({ journey, patientId, canCorrect }: { journey: any; patientId: string; canCorrect: boolean }) {
  const { t, fmt } = useI18n();
  const kgChange = (n: number) => (n === 0 ? t('no change') : rawKgChange(n));
  const [editingGoal, setEditingGoal] = useState(false);
  const [editingCheckIn, setEditingCheckIn] = useState<string | null>(null);

  const refetch = { refetchQueries: [{ query: GET_WEIGHT_JOURNEY, variables: { patientId } }] };
  const [correctGoal, goal] = useMutation(CORRECT_WEIGHT_GOAL, refetch);
  const [correctWeight, weight] = useMutation(CORRECT_CHECK_IN_WEIGHT, refetch);

  const entries: any[] = journey.entries;
  const last = entries[entries.length - 1];
  const lastFeeling = last?.feeling ? FEELINGS[last.feeling] : null;
  const hasProgress = journey.progressPercentage !== null && journey.progressPercentage !== undefined;

  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Stat label="Starting" value={kg(journey.startingWeightKg)} />
        <Stat label="Current" value={kg(journey.currentWeightKg)} />
        <Stat label="Target" value={kg(journey.targetWeightKg)} />
        <Stat label="Progress" value={hasProgress ? `${Number(journey.progressPercentage.toFixed(1))}%` : '—'} />
        <Stat label="Lost" value={hasProgress ? kg(journey.weightLostKg) : '—'} />
        <Stat label="Remaining" value={hasProgress ? kg(journey.remainingKg) : '—'} />
      </div>

      {hasProgress && (
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={journey.progressPercentage} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-brand-500" style={{ width: `${journey.progressPercentage}%` }} />
        </div>
      )}
      {!hasProgress && <p className="text-xs text-gray-400">{t('The patient hasn’t set a target weight yet.')}</p>}

      <div className="bg-gray-50 rounded-xl p-4 text-sm">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t('Last check-in')}</p>
        {last ? (
          <>
            <p className="text-gray-800">
              {fmt(last.date, 'dd MMM yyyy')} · {kg(last.weightKg)} ({kgChange(last.changeKg)})
            </p>
            {lastFeeling && <p className="text-gray-600 mt-0.5">{lastFeeling.emoji} {t(lastFeeling.label)}</p>}
            {last.note && <p className="text-gray-500 italic mt-1">&ldquo;{last.note}&rdquo;</p>}
            {last.feeling === 'NOT_WELL' && (
              <p className="mt-2 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg px-2 py-1 inline-block">{t('Patient reported not feeling well')}</p>
            )}
          </>
        ) : (
          <p className="text-gray-400">{t('No completed check-ins yet.')}</p>
        )}
      </div>

      {canCorrect && (
        <div>
          {!editingGoal ? (
            <button onClick={() => setEditingGoal(true)} className="text-xs text-brand-500 hover:text-brand-900">{t('Correct starting / target weight')}</button>
          ) : (
            <CorrectionForm
              fields={[
                { key: 'startingWeightKg', label: t('Starting'), initial: String(journey.startingWeightKg ?? '') },
                { key: 'targetWeightKg', label: t('Target'), initial: String(journey.targetWeightKg ?? '') },
              ]}
              saving={goal.loading}
              error={goal.error?.message}
              onCancel={() => setEditingGoal(false)}
              onSave={async (v, reason) => {
                try {
                  await correctGoal({ variables: { input: { patientId, ...v, reason: reason || undefined } } });
                  setEditingGoal(false);
                } catch { /* shown via goal.error */ }
              }}
            />
          )}
        </div>
      )}


      <RecordedWeights patientId={patientId} canCorrect={canCorrect} />
      {/* Body photos are for doctors only (ADMIN, DOCTOR) — the same roles that may correct weights. */}
      {canCorrect && <ProgressPhotos patientId={patientId} />}

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('Check-ins')}</p>
        {entries.length === 0 ? (
          <p className="text-sm text-gray-400">{t('Nothing recorded yet.')}</p>
        ) : (
          <div className="space-y-2">
            {[...entries].reverse().map((e) => {
              const feeling = e.feeling ? FEELINGS[e.feeling] : null;
              return (
                <div key={e.checkInId} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{t('Month {n}', { n: e.month })} · {kg(e.weightKg)}</p>
                    <p className="text-xs text-gray-400">{fmt(e.date, 'dd MMM yyyy')}</p>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t('Previous')} {kg(e.previousWeightKg)} · {kgChange(e.changeKg)}
                    {feeling && <> · {feeling.emoji} {t(feeling.label)}</>}
                  </p>
                  {e.note && <p className="text-xs text-gray-500 italic mt-1">&ldquo;{e.note}&rdquo;</p>}
                  {canCorrect && editingCheckIn !== e.checkInId && (
                    <button onClick={() => setEditingCheckIn(e.checkInId)} className="text-xs text-brand-500 hover:text-brand-900 mt-1.5">{t('Correct weight')}</button>
                  )}
                  {editingCheckIn === e.checkInId && (
                    <CorrectionForm
                      fields={[{ key: 'weightKg', label: t('Weight'), initial: String(e.weightKg) }]}
                      saving={weight.loading}
                      error={weight.error?.message}
                      onCancel={() => setEditingCheckIn(null)}
                      onSave={async (v, reason) => {
                        try {
                          await correctWeight({ variables: { input: { checkInId: e.checkInId, weightKg: v.weightKg, reason: reason || undefined } } });
                          setEditingCheckIn(null);
                        } catch { /* shown via weight.error */ }
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const YEAR_MS = 365 * 86_400_000;

/** Every recorded weight (daily entries and monthly check-ins) for the last 12 months, newest first. */
function RecordedWeights({ patientId, canCorrect }: { patientId: string; canCorrect: boolean }) {
  const { t, fmt } = useI18n();
  const kgChange = (n: number) => (n === 0 ? t('no change') : rawKgChange(n));
  const [range] = useState(() => ({ from: new Date(Date.now() - YEAR_MS).toISOString(), to: new Date(Date.now() + 3_600_000).toISOString() }));
  const variables = { patientId, ...range, limit: 500 };
  const { data, loading, error } = useQuery(GET_WEIGHT_TIMELINE, { variables, fetchPolicy: 'cache-and-network' });
  const refetch = { refetchQueries: [{ query: GET_WEIGHT_TIMELINE, variables }, { query: GET_WEIGHT_JOURNEY, variables: { patientId } }] };
  const [correct, corr] = useMutation(CORRECT_WEIGHT_ENTRY, refetch);
  const [voidEntry, vd] = useMutation(VOID_WEIGHT_ENTRY, refetch);
  const [open, setOpen] = useState<{ id: string; action: 'correct' | 'void' } | null>(null);
  const [reason, setReason] = useState('');

  const rows: any[] = data ? [...data.weightTimelineForPatient.measurements].reverse() : [];
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('Recorded weights · last 12 months')}</p>
      {error && <p className="text-xs text-red-600">{error.message}</p>}
      {loading && !data && <p className="text-sm text-gray-400">{t('Loading…')}</p>}
      {data && rows.length === 0 && <p className="text-sm text-gray-400">{t('No weights recorded.')}</p>}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {rows.map((r) => (
          <div key={r.id} className="border border-gray-100 rounded-xl p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-gray-900">{kg(r.weightKg)}</p>
              <p className="text-xs text-gray-400">{fmt(r.measuredAt, 'dd MMM yyyy · HH:mm')}</p>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {r.kind === 'CHECK_IN' ? t('Check-in') : r.hasPhoto ? `${t('Daily entry')} · 📷` : t('Daily entry')}
              {r.changeKg !== null && r.changeKg !== undefined && <> · {kgChange(r.changeKg)}</>}
              {r.feeling && FEELINGS[r.feeling] && <> · {FEELINGS[r.feeling].emoji} {t(FEELINGS[r.feeling].label)}</>}
            </p>
            {r.note && <p className="text-xs text-gray-500 italic mt-1">&ldquo;{r.note}&rdquo;</p>}
            {canCorrect && r.kind === 'DAILY' && open?.id !== r.id && (
              <div className="flex gap-3 mt-1.5">
                <button onClick={() => { setOpen({ id: r.id, action: 'correct' }); setReason(''); }} className="text-xs text-brand-500 hover:text-brand-900">{t('Correct')}</button>
                <button onClick={() => { setOpen({ id: r.id, action: 'void' }); setReason(''); }} className="text-xs text-gray-400 hover:text-red-600">{t('Void')}</button>
              </div>
            )}
            {open?.id === r.id && open?.action === 'correct' && (
              <CorrectionForm
                requireReason
                fields={[{ key: 'weightKg', label: t('Correct weight'), initial: String(r.weightKg) }]}
                saving={corr.loading}
                error={corr.error?.message}
                onCancel={() => setOpen(null)}
                onSave={async (v, why) => {
                  try { await correct({ variables: { input: { entryId: r.id, weightKg: v.weightKg, reason: why } } }); setOpen(null); } catch { /* shown via corr.error */ }
                }}
              />
            )}
            {open?.id === r.id && open?.action === 'void' && (
              <div className="mt-2 space-y-2 bg-amber-50 border border-amber-100 rounded-xl p-3">
                <input placeholder={t('Reason for voiding (required — kept in the audit log)')} value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputCls} w-full`} />
                {vd.error && <p className="text-xs text-red-600">{vd.error.message}</p>}
                <div className="flex gap-2">
                  <button
                    disabled={!reason.trim() || vd.loading}
                    onClick={async () => { try { await voidEntry({ variables: { entryId: r.id, reason: reason.trim() } }); setOpen(null); } catch { /* shown via vd.error */ } }}
                    className="px-3 py-1 text-xs font-medium rounded-lg bg-amber-500 text-white disabled:opacity-40"
                  >
                    {vd.loading ? t('Voiding…') : t('Void entry')}
                  </button>
                  <button onClick={() => setOpen(null)} className="text-xs text-gray-400 hover:text-gray-600">{t('Cancel')}</button>
                </div>
                <p className="text-xs text-gray-400">{t('The entry stays on record, marked voided; it stops counting toward the patient’s weight.')}</p>
              </div>
            )}
          </div>
        ))}
      </div>
      {data?.weightTimelineForPatient.truncated && <p className="text-xs text-gray-400 mt-2">{t('Showing the 500 most recent.')}</p>}
    </div>
  );
}

