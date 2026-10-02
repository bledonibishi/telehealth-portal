'use client';

import { useState } from 'react';
import Link from 'next/link';
import { differenceInCalendarDays, format } from 'date-fns';
import { kg } from '@/lib/weight';
import { Dialog } from '@/components/common/Dialog';
import { ProgressRing } from './ProgressRing';
import { TargetWeightForm } from './TargetWeightForm';
import { LogWeightForm } from './LogWeightForm';
import { WeightSparkline } from '@/components/dashboard/WeightSparkline';

/** One line about the monthly check-in: ready (with a Start button), done, or when it is due. */
function CheckInLine({ journey }: { journey: any }) {
  if (journey.checkInState === 'READY') {
    return (
      <div className="bg-brand-50 border border-brand-100 rounded-xl px-3 py-2 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-brand-900">Your monthly check-in is ready</p>
        {journey.checkInUrl && (
          <a href={journey.checkInUrl} className="flex-shrink-0 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-4 py-2 rounded-lg">Start</a>
        )}
      </div>
    );
  }
  const due = journey.nextCheckInDueAt ? differenceInCalendarDays(new Date(journey.nextCheckInDueAt), new Date()) : null;
  const dueText = due === null ? null : due > 1 ? `in ${due} days` : due === 1 ? 'in 1 day' : due === 0 ? 'today' : 'soon';
  if (journey.checkInState === 'COMPLETED') return <p className="text-xs text-slate-500">✓ Monthly check-in done{dueText && due !== null && due >= 0 ? ` · next ${dueText}` : ''}</p>;
  return dueText ? <p className="text-xs text-slate-500">Monthly check-in due {dueText}</p> : null;
}

function Stat({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800 truncate">{value}{children}</p>
    </div>
  );
}

/** The journey at a glance, kept short enough to sit beside the treatment card without scrolling. */
export function WeightJourneyCard({ journey, showLink = true, allowLog = true, trend = false }: { journey: any; showLink?: boolean; allowLog?: boolean; trend?: boolean }) {
  const [dialog, setDialog] = useState<'log' | 'target' | null>(null);
  const hasTarget = journey.targetWeightKg !== null && journey.targetWeightKg !== undefined;
  const hasProgress = journey.progressPercentage !== null && journey.progressPercentage !== undefined;

  return (
    <section className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5" aria-labelledby="weight-journey-title">
      <div className="flex items-center justify-between mb-3">
        <h2 id="weight-journey-title" className="text-xs font-semibold text-brand-700 uppercase tracking-wide">Weight journey</h2>
        <div className="flex items-center gap-3">
          {allowLog && journey.startingWeightKg && (
            <button type="button" onClick={() => setDialog('log')} className="text-xs font-semibold text-brand-600 hover:text-brand-700">+ Log weight</button>
          )}
          {showLink && <Link href="/weight-journey" className="text-xs font-medium text-brand-600 hover:text-brand-700">Details →</Link>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-3xl font-bold text-slate-900 leading-tight">{kg(journey.currentWeightKg)}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {journey.latestMeasurementAt ? `Updated ${format(new Date(journey.latestMeasurementAt), 'MMM d · HH:mm')}` : 'Current weight'}
          </p>
          {hasProgress && <p className="text-xs text-slate-500 mt-1.5 max-w-[16rem]">{journey.motivationMessage}</p>}
        </div>
        {hasProgress && <ProgressRing percent={journey.progressPercentage} size={84} />}
      </div>

      {hasProgress ? (
        <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-slate-100">
          <Stat label="Start" value={kg(journey.startingWeightKg)} />
          <Stat label="Lost" value={kg(Math.max(journey.weightLostKg, 0))} />
          <Stat label="To go" value={kg(journey.remainingKg)} />
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400">Target</p>
            <p className="text-sm font-semibold text-slate-800">
              {kg(journey.targetWeightKg)}
              <button type="button" onClick={() => setDialog('target')} className="text-[11px] font-medium text-brand-600 hover:text-brand-700 ml-1.5">Edit</button>
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-3 bg-slate-50 rounded-xl p-3">
          {journey.startingWeightKg ? <TargetWeightForm /> : <p className="text-sm text-slate-500">Complete your medical questionnaire and we’ll set up your journey.</p>}
        </div>
      )}

      {trend && hasProgress && <WeightSparkline target={journey.targetWeightKg} />}

      <div className="mt-3"><CheckInLine journey={journey} /></div>

      {dialog === 'log' && (
        <Dialog title="Log your weight" onClose={() => setDialog(null)}>
          <LogWeightForm onSaved={() => setDialog(null)} onCancel={() => setDialog(null)} />
        </Dialog>
      )}
      {dialog === 'target' && hasTarget && (
        <Dialog title="Change your target weight" onClose={() => setDialog(null)}>
          <TargetWeightForm current={journey.targetWeightKg} onDone={() => setDialog(null)} />
        </Dialog>
      )}
    </section>
  );
}
