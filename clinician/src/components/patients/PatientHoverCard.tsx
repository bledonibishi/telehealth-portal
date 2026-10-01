'use client';

import { useI18n } from '@/lib/i18n/I18nProvider';
import { kg } from '@/lib/weight';
import { TREATMENT_STATUS, type TreatmentStatus } from '@/lib/patient-status';
import MedicationPill from './MedicationPill';
import ProgressRing from './ProgressRing';

/** Height the card is laid out for, so the list can keep it inside the screen. */
export const HOVER_CARD_HEIGHT = 184;

/**
 * A small business-card summary of a patient, shown when hovering a row: who they are, what they are on,
 * and how far along the weight goal is. Everything comes from the list row, so hovering costs no requests.
 */
export default function PatientHoverCard({ patient }: { patient: any }) {
  const { t, timeAgo } = useI18n();
  const status = TREATMENT_STATUS[patient.treatmentStatus as TreatmentStatus];
  const hasGoal = patient.targetWeightKg !== null && patient.targetWeightKg !== undefined;
  const lost: number | null = patient.weightLostKg ?? null;
  const toGo = hasGoal && patient.currentWeightKg != null ? Math.max(patient.currentWeightKg - patient.targetWeightKg, 0) : null;

  return (
    <div
      className="w-[300px] rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-panel)] shadow-xl shadow-black/40 p-4 flex flex-col gap-3 cursor-pointer"
      style={{ minHeight: HOVER_CARD_HEIGHT }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-white text-sm font-semibold flex items-center justify-center shrink-0">
          {patient.firstName[0]}{patient.lastName[0]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[color:var(--t-strong)] truncate">{patient.firstName} {patient.lastName}</p>
          <span className={`inline-block mt-0.5 text-[11px] font-medium px-2 py-px rounded-full ${status.dark}`}>{t(status.label)}</span>
        </div>
      </div>

      {patient.medications.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {patient.medications.map((m: any, i: number) => <MedicationPill key={i} label={m.label} dose={m.dose} solid />)}
        </div>
      )}

      {hasGoal ? (
        <div className="flex items-center gap-3">
          <ProgressRing value={patient.progressPercentage} size={58} stroke={6} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs flex-1">
            <div>
              <dt className="text-[color:var(--t-dim)]">{t('Weight lost')}</dt>
              <dd className={`font-semibold ${lost && lost > 0 ? 'text-emerald-400' : 'text-[color:var(--t-strong)]'}`}>
                {lost === null ? '—' : kg(Math.abs(lost))}
              </dd>
            </div>
            <div>
              <dt className="text-[color:var(--t-dim)]">{t('Target')}</dt>
              <dd className="font-semibold text-[color:var(--t-strong)]">{kg(patient.targetWeightKg)}</dd>
            </div>
            <div className="col-span-2 text-[color:var(--t-muted)]">
              {toGo !== null && toGo > 0 ? t('{weight} to go', { weight: kg(toGo) }) : t('Target reached')}
            </div>
          </dl>
        </div>
      ) : (
        <p className="text-xs text-[color:var(--t-muted)]">
          {patient.startingWeightKg != null ? t('No target set') : patient.lastWeighedAt ? t('Last check-in') + ': ' + timeAgo(patient.lastWeighedAt) : t('No weight goal')}
        </p>
      )}

      <p className="mt-auto text-[11px] text-sky-400">{t('Open profile →')}</p>
    </div>
  );
}
