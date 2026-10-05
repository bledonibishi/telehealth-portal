'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { differenceInCalendarWeeks, format } from 'date-fns';
import { MY_PROGRESS_PHOTOS } from '@/graphql/weight';
import { MY_ONBOARDING } from '@/graphql/onboarding';
import { kg } from '@/lib/weight';
import { useRecentWeights } from '@/lib/useRecentWeights';
import { AuthedImage } from '@/components/common/AuthedImage';
import { Dialog } from '@/components/common/Dialog';
import { LogWeightForm } from '@/components/weight/LogWeightForm';
import { Card, CardHeader } from '@/components/portal/Card';
import { Icon } from '@/components/portal/Icon';

type Shot = { key: string; at: string; weightKg: number | null; fileId: string | null; label: string };

const fileIdOf = (url?: string | null) => url?.match(/\/uploads\/([^/]+)\/file/)?.[1] ?? null;

function PhotoCard({ shot }: { shot: Shot }) {
  return (
    <li className="rounded-xl border border-slate-200 p-3 flex flex-col min-w-0">
      <p className="text-[11px] text-slate-500 whitespace-nowrap">{format(new Date(shot.at), 'd MMM yyyy')}</p>
      <p className="text-base font-bold text-ink-900 whitespace-nowrap">{kg(shot.weightKg)}</p>
      {shot.fileId ? (
        <AuthedImage fileId={shot.fileId} alt={`Progress photo, ${format(new Date(shot.at), 'MMMM d, yyyy')}`} className="mt-2 w-full aspect-[4/5] object-cover rounded-lg" />
      ) : (
        <div className="mt-2 w-full aspect-[4/5] rounded-lg bg-slate-50 flex items-center justify-center text-slate-300"><Icon name="camera" className="w-6 h-6" /></div>
      )}
      <p className="text-xs text-slate-500 text-center mt-2 bg-slate-50 rounded-md py-1">{shot.label}</p>
    </li>
  );
}

/**
 * The journey in pictures: the body photo from sign-up as "Before", then the progress photos saved with
 * weigh-ins, each with its date and weight. Private to the patient and their doctors.
 */
export function WeightPhotoJourney({ journey }: { journey: any }) {
  const { data } = useQuery(MY_PROGRESS_PHOTOS, { fetchPolicy: 'cache-and-network' });
  const { data: ob } = useQuery(MY_ONBOARDING, { fetchPolicy: 'cache-first' });
  const [adding, setAdding] = useState(false);
  const { points } = useRecentWeights();

  const photos: Array<{ entryId: string; measuredAt: string; weightKg: number; photoFileId: string }> = data?.myProgressPhotos ?? [];
  const onboarding = ob?.myOnboarding;
  const startFile = fileIdOf(onboarding?.bodyPhotoFrontUrl);
  const startAt: string | null = onboarding?.submittedAt ?? photos[0]?.measuredAt ?? null;

  const shots: Shot[] = [];
  if (startFile && startAt) shots.push({ key: 'start', at: startAt, weightKg: journey.startingWeightKg ?? null, fileId: startFile, label: 'Before' });
  const from = startAt ? new Date(startAt) : photos[0] ? new Date(photos[0].measuredAt) : points[0] ? new Date(points[0].t) : null;
  photos.forEach((p, i) => {
    const week = from ? differenceInCalendarWeeks(new Date(p.measuredAt), from) : i;
    shots.push({ key: p.entryId, at: p.measuredAt, weightKg: p.weightKg, fileId: p.photoFileId, label: shots.length === 0 ? 'Before' : week <= 0 ? 'Start' : `Week ${week}` });
  });
  // Too few photos to tell the story: fill in with recent weigh-ins (dated, without a picture).
  if (shots.length < 3 && points.length) {
    const days = new Set(shots.map((s) => s.at.slice(0, 10)));
    const picks = [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]]
      .filter((p, i, a) => a.findIndex((q) => q.t === p.t) === i)
      .filter((p) => !days.has(new Date(p.t).toISOString().slice(0, 10)));
    for (const p of picks.slice(-(3 - shots.length))) {
      const week = from ? differenceInCalendarWeeks(new Date(p.t), from) : null;
      shots.push({ key: `w${p.t}`, at: new Date(p.t).toISOString(), weightKg: p.w, fileId: null, label: week && week > 0 ? `Week ${week}` : 'Weigh-in' });
    }
    shots.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }
  const shown = shots.length > 3 ? [shots[0], ...shots.slice(-2)] : shots;

  return (
    <Card labelledBy="journey-title" className="h-full">
      <CardHeader id="journey-title" title="Weight Journey" subtitle="Track your progress with photos and weight updates.">
        <button type="button" onClick={() => setAdding(true)} className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-ink-600/40 text-ink-800 hover:bg-ink-50 text-xs font-semibold px-3 py-1.5">
          <Icon name="plus" className="w-3.5 h-3.5" /> Add New Entry
        </button>
      </CardHeader>

      <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {shown.map((s) => <PhotoCard key={s.key} shot={s} />)}
        <li>
          <button type="button" onClick={() => setAdding(true)} className="w-full h-full min-h-[12rem] rounded-xl border-2 border-dashed border-ink-600/30 text-ink-700 hover:bg-ink-50 flex flex-col items-center justify-center gap-2 p-3">
            <Icon name="camera" className="w-7 h-7" />
            <span className="text-sm font-medium">Add Photo</span>
            <span className="text-xs text-slate-500">+ Add weight</span>
          </button>
        </li>
      </ul>
      <p className="text-[11px] text-slate-400 mt-3 flex items-center gap-1.5"><Icon name="shield" className="w-3.5 h-3.5" /> Only you and your doctor can see your photos.</p>

      {adding && (
        <Dialog title="Add a weight and photo" onClose={() => setAdding(false)}>
          <LogWeightForm onSaved={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </Dialog>
      )}
    </Card>
  );
}
