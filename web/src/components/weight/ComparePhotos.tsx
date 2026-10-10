'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { kg, kgChange } from '@/lib/weight';
import type { JourneyEntry } from '@/lib/journey-entries';
import { Card, CardHeader } from '@/components/portal/Card';
import { Icon } from '@/components/portal/Icon';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { useJourneyPhotos } from './JourneyPhotos';

const select = 'block w-full mt-1 border border-slate-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500';
const optionOf = (p: JourneyEntry) => `${p.label} · ${format(new Date(p.at), 'd MMM yyyy')} · ${kg(p.weightKg)}`;
const captionOf = (p: JourneyEntry) => `${format(new Date(p.at), 'd MMM yyyy')} · ${kg(p.weightKg)}`;

/** Any two of the patient's photos under one handle: drag it to see the change, with the kilos between them underneath. */
export function ComparePhotos() {
  const { photos, loading, add } = useJourneyPhotos();
  const [beforeKey, setBeforeKey] = useState<string | null>(null);
  const [afterKey, setAfterKey] = useState<string | null>(null);

  // Start with the first photo against the latest; keep a choice the patient has made while it still exists.
  useEffect(() => {
    if (!photos.length) return;
    setBeforeKey((k) => (k && photos.some((p) => p.key === k) ? k : photos[0].key));
    setAfterKey((k) => (k && photos.some((p) => p.key === k) ? k : photos[photos.length - 1].key));
  }, [photos]);

  const before = photos.find((p) => p.key === beforeKey) ?? photos[0];
  const after = photos.find((p) => p.key === afterKey) ?? photos[photos.length - 1];
  const change = before && after && before.weightKg !== null && after.weightKg !== null ? Math.round((after.weightKg - before.weightKg) * 10) / 10 : null;
  const days = before && after ? Math.round(Math.abs(Date.parse(after.at) - Date.parse(before.at)) / 86_400_000) : 0;

  return (
    <Card labelledBy="compare-title">
      <CardHeader id="compare-title" title="Compare photos" subtitle="Pick two photos and drag the handle between them." />

      {loading && photos.length === 0 && <div className="h-40 rounded-md bg-slate-50 animate-pulse" role="status" aria-label="Loading your photos" />}

      {!loading && photos.length < 2 && (
        <div className="rounded-md bg-slate-50 p-5 text-center">
          <p className="text-sm font-medium text-slate-700">Add at least 2 photos to compare</p>
          <p className="text-xs text-slate-500 mt-1">{photos.length === 1 ? 'You have one so far. Add another with your next weigh-in.' : 'Take one with each weigh-in and the change shows up here.'}</p>
          <button type="button" onClick={() => add('photo')} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-ink-600 hover:bg-ink-700 text-white text-xs font-semibold px-3 py-2"><Icon name="camera" className="w-4 h-4" /> Add a photo</button>
        </div>
      )}

      {photos.length >= 2 && before && after && (
        <div className="grid md:grid-cols-[minmax(0,20rem)_1fr] gap-5 items-center">
          <BeforeAfterSlider beforeId={before.fileId!} afterId={after.fileId!} beforeLabel={captionOf(before)} afterLabel={captionOf(after)} />

          <div className="min-w-0">
            <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
              <label className="text-xs font-medium text-slate-500">
                Before
                <select className={select} value={before.key} onChange={(e) => setBeforeKey(e.target.value)}>
                  {photos.map((p) => <option key={p.key} value={p.key}>{optionOf(p)}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-500">
                After
                <select className={select} value={after.key} onChange={(e) => setAfterKey(e.target.value)}>
                  {photos.map((p) => <option key={p.key} value={p.key}>{optionOf(p)}</option>)}
                </select>
              </label>
            </div>

            <div className="mt-4 rounded-md bg-slate-50 px-4 py-3" aria-live="polite">
              {before.key === after.key ? (
                <p className="text-sm text-slate-500">Choose two different photos to compare.</p>
              ) : change === null ? (
                <p className="text-sm text-slate-500">{days} days between these photos.</p>
              ) : (
                <>
                  <p className={`text-2xl font-bold flex items-center gap-2 ${change < 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                    {kgChange(change)}
                    {change < 0 && <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><Icon name="check" className="w-4 h-4" /></span>}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">between these photos, {days} {days === 1 ? 'day' : 'days'} apart</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
