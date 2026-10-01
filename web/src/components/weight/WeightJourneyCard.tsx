'use client';

import { useState } from 'react';
import Link from 'next/link';
import { differenceInCalendarDays, format } from 'date-fns';
import { kg } from '@/lib/weight';
import { ProgressRing } from './ProgressRing';
import { TargetWeightForm } from './TargetWeightForm';
import { LogWeightForm } from './LogWeightForm';

function CheckInStatus({ journey }: { journey: any }) {
  if (journey.checkInState === 'READY') {
    return (
      <div className="bg-brand-50 border border-brand-100 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-brand-900">Your monthly check-in is ready</p>
        {journey.checkInUrl && (
          <a href={journey.checkInUrl} className="flex-shrink-0 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-3 rounded-xl">
            Start
          </a>
        )}
      </div>
    );
  }

  const due = journey.nextCheckInDueAt ? differenceInCalendarDays(new Date(journey.nextCheckInDueAt), new Date()) : null;
  const dueText =
    due === null ? null : due > 1 ? `Due in ${due} days` : due === 1 ? 'Due in 1 day' : due === 0 ? 'Due today' : 'Your next check-in will be sent shortly';

  if (journey.checkInState === 'COMPLETED') {
    return (
      <div className="bg-slate-50 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-700">✓ Monthly check-in completed</p>
        {dueText && due !== null && due >= 0 && <p className="text-xs text-slate-400">Next: {dueText.toLowerCase()}</p>}
      </div>
    );
  }

  return dueText ? (
    <div className="bg-slate-50 rounded-xl px-4 py-3">
      <p className="text-sm font-medium text-slate-700">Monthly check-in · {dueText}</p>
    </div>
  ) : null;
}

/** The at-a-glance journey, ordered for a phone: current weight → progress → lost/remaining → check-in → start/target. */
export function WeightJourneyCard({ journey, showLink = true }: { journey: any; showLink?: boolean }) {
  const [editingTarget, setEditingTarget] = useState(false);
  const [logging, setLogging] = useState(false);
  const hasTarget = journey.targetWeightKg !== null && journey.targetWeightKg !== undefined;
  const hasProgress = journey.progressPercentage !== null && journey.progressPercentage !== undefined;

  return (
    <section className="bg-white rounded-2xl border border-slate-100 p-5 sm:p-6 mb-4" aria-labelledby="weight-journey-title">
      <div className="flex items-center justify-between mb-4">
        <h2 id="weight-journey-title" className="text-xs font-semibold text-brand-700 uppercase tracking-wide">
          Your Weight Journey
        </h2>
        <div className="flex items-center gap-4">
          {journey.startingWeightKg && (
            <button type="button" onClick={() => setLogging((v) => !v)} aria-expanded={logging} className="text-xs font-semibold text-brand-600 hover:text-brand-700 py-1">
              {logging ? 'Close' : '+ Log weight'}
            </button>
          )}
          {showLink && (
            <Link href="/weight-journey" className="text-xs font-medium text-brand-600 hover:text-brand-700 py-1">
              Full journey →
            </Link>
          )}
        </div>
      </div>

      {logging && (
        <div className="mb-4 bg-slate-50 rounded-xl p-4">
          <LogWeightForm compact onSaved={() => setLogging(false)} onCancel={() => setLogging(false)} />
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-slate-400">Current weight</p>
          <p className="text-3xl sm:text-4xl font-bold text-slate-900 mt-0.5">{kg(journey.currentWeightKg)}</p>
          {journey.latestMeasurementAt && (
            <p className="text-xs text-slate-400 mt-1">Updated {format(new Date(journey.latestMeasurementAt), 'MMM d · HH:mm')}</p>
          )}
        </div>
        {hasProgress && <ProgressRing percent={journey.progressPercentage} />}
      </div>

      {hasProgress && <p className="text-sm text-slate-500 mt-3">{journey.motivationMessage}</p>}

      {hasProgress ? (
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-brand-50 rounded-xl px-4 py-3">
            <p className="text-lg font-semibold text-brand-900">{kg(Math.max(journey.weightLostKg, 0))}</p>
            <p className="text-xs text-slate-500">lost</p>
          </div>
          <div className="bg-slate-50 rounded-xl px-4 py-3">
            <p className="text-lg font-semibold text-slate-900">{kg(journey.remainingKg)}</p>
            <p className="text-xs text-slate-500">remaining</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 bg-slate-50 rounded-xl p-4">
          {journey.startingWeightKg ? (
            <TargetWeightForm />
          ) : (
            <p className="text-sm text-slate-500">Complete your medical questionnaire and we&rsquo;ll set up your journey.</p>
          )}
        </div>
      )}

      <div className="mt-4">
        <CheckInStatus journey={journey} />
      </div>

      <div className="flex items-center justify-between text-sm mt-4 pt-4 border-t border-slate-100">
        <div>
          <p className="text-xs text-slate-400">Starting</p>
          <p className="font-medium text-slate-700">{kg(journey.startingWeightKg)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Target</p>
          {hasTarget ? (
            <p className="font-medium text-slate-700">
              {kg(journey.targetWeightKg)}{' '}
              <button onClick={() => setEditingTarget((v) => !v)} className="text-xs text-brand-600 hover:text-brand-700 ml-1">
                Change
              </button>
            </p>
          ) : (
            <p className="text-slate-400">Not set</p>
          )}
        </div>
      </div>

      {editingTarget && hasTarget && (
        <div className="mt-3 bg-slate-50 rounded-xl p-4">
          <TargetWeightForm current={journey.targetWeightKg} onDone={() => setEditingTarget(false)} />
        </div>
      )}
    </section>
  );
}
