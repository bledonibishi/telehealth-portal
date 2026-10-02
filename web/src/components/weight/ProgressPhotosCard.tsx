'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@apollo/client';
import { format } from 'date-fns';
import { MY_PROGRESS_PHOTOS } from '@/graphql/weight';
import { kg, kgChange } from '@/lib/weight';
import { AuthedImage } from '@/components/common/AuthedImage';
import { BeforeAfterSlider } from './BeforeAfterSlider';

type Photo = { entryId: string; measuredAt: string; weightKg: number; photoFileId: string };

const sel = 'border border-slate-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 max-w-full';

const labelOf = (p: Photo) => `${format(new Date(p.measuredAt), 'MMM d, yyyy')} · ${kg(p.weightKg)}`;

/** The patient's own progress photos, with the first and the latest side by side. Private to them and their doctors. */
export function ProgressPhotosCard() {
  const { data, loading } = useQuery(MY_PROGRESS_PHOTOS, { fetchPolicy: 'cache-and-network' });
  const photos: Photo[] = data?.myProgressPhotos ?? [];
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);

  // Start with the first photo against the most recent one; keep a choice the patient has made.
  useEffect(() => {
    if (!photos.length) return;
    setBeforeId((b) => (b && photos.some((p) => p.entryId === b) ? b : photos[0].entryId));
    setAfterId((a) => (a && photos.some((p) => p.entryId === a) ? a : photos[photos.length - 1].entryId));
  }, [photos]);

  const before = photos.find((p) => p.entryId === beforeId) ?? photos[0];
  const after = photos.find((p) => p.entryId === afterId) ?? photos[photos.length - 1];

  return (
    <section aria-label="Progress photos">
      <p className="text-xs text-slate-400 mb-3">Only you and your doctor can see these photos.</p>

      {loading && !photos.length && <div className="h-48 rounded-xl bg-slate-50 animate-pulse" role="status" aria-label="Loading your photos" />}

      {!loading && photos.length === 0 && (
        <p className="text-sm text-slate-500 py-4">
          Add a photo when you tap “Log weight”. Seeing the change side by side is often more motivating than the scale.
        </p>
      )}

      {photos.length === 1 && (
        <div className="max-w-xs mx-auto">
          <AuthedImage fileId={photos[0].photoFileId} alt={labelOf(photos[0])} className="w-full aspect-[3/4] object-cover rounded-2xl" />
          <p className="text-xs text-slate-500 text-center mt-2">{labelOf(photos[0])}</p>
          <p className="text-xs text-slate-400 text-center mt-1">Add another photo next month to compare them here.</p>
        </div>
      )}

      {photos.length >= 2 && before && after && (
        <>
          <BeforeAfterSlider beforeId={before.photoFileId} afterId={after.photoFileId} beforeLabel={labelOf(before)} afterLabel={labelOf(after)} />
          <p className="text-sm text-slate-700 text-center mt-3">
            {before.entryId === after.entryId ? 'Choose two different photos to compare.' : `${kgChange(Math.round((after.weightKg - before.weightKg) * 10) / 10)} between these photos`}
          </p>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <label className="text-xs text-slate-500">
              Before
              <select className={`${sel} block w-full mt-1`} value={before.entryId} onChange={(e) => setBeforeId(e.target.value)}>
                {photos.map((p) => <option key={p.entryId} value={p.entryId}>{labelOf(p)}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              After
              <select className={`${sel} block w-full mt-1`} value={after.entryId} onChange={(e) => setAfterId(e.target.value)}>
                {photos.map((p) => <option key={p.entryId} value={p.entryId}>{labelOf(p)}</option>)}
              </select>
            </label>
          </div>

          <ul className="flex gap-2 overflow-x-auto mt-4 pb-1" aria-label="All photos">
            {photos.map((p) => (
              <li key={p.entryId} className="shrink-0">
                <button type="button" onClick={() => setAfterId(p.entryId)} className="block w-16" aria-label={`Show ${labelOf(p)} as the after photo`}>
                  <AuthedImage fileId={p.photoFileId} alt="" className={`w-16 h-20 object-cover rounded-lg ${p.entryId === after.entryId ? 'ring-2 ring-brand-500' : p.entryId === before.entryId ? 'ring-2 ring-slate-300' : ''}`} />
                  <span className="block text-[10px] text-slate-400 mt-0.5 text-center">{format(new Date(p.measuredAt), 'MMM d')}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
