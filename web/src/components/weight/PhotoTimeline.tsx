'use client';

import { format } from 'date-fns';
import { kg } from '@/lib/weight';
import { AuthedImage } from '@/components/common/AuthedImage';
import { Icon } from '@/components/portal/Icon';
import { useJourneyPhotos } from './JourneyPhotos';

/** Every photo left to right in the order it was taken, on a line, with its date underneath. Scrolls sideways. */
export function PhotoTimeline() {
  const { photos, loading, open, add } = useJourneyPhotos();

  if (loading && photos.length === 0) return <div className="h-40 rounded-md bg-slate-50 animate-pulse" role="status" aria-label="Loading your photos" />;
  if (photos.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-slate-500">No photos yet. Seeing the change is often more motivating than the scale.</p>
        <button type="button" onClick={() => add('photo')} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-ink-600 hover:bg-ink-700 text-white text-xs font-semibold px-3 py-2"><Icon name="camera" className="w-4 h-4" /> Add a photo</button>
      </div>
    );
  }

  return (
    <section aria-label="Photos over time">
      <p className="text-xs text-slate-400 mb-3">Only you and your doctor can see these photos.</p>
      <ol className="flex gap-4 overflow-x-auto pb-2 snap-x">
        {photos.map((p, i) => (
          <li key={p.key} className="wj-rise shrink-0 w-28 snap-start" style={{ animationDelay: `${Math.min(i, 12) * 60}ms` }}>
            <button type="button" onClick={() => open(p)} className="block w-full rounded-md overflow-hidden transition duration-200 hover:-translate-y-1 hover:shadow-[0_8px_25px_rgba(0,0,0,0.12)]" aria-label={`Open the photo from ${format(new Date(p.at), 'd MMMM yyyy')} full screen`}>
              <AuthedImage fileId={p.fileId!} alt="" className="w-28 h-36 object-cover" />
            </button>
            {/* The line the photos sit on, with a dot under each. */}
            <div className="relative h-5 mt-1" aria-hidden>
              <span className={`absolute top-1/2 h-px bg-slate-200 ${i === 0 ? 'left-1/2' : '-left-4'} ${i === photos.length - 1 ? 'right-1/2' : 'right-0'}`} />
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-ink-600 ring-2 ring-white" />
            </div>
            <p className="text-xs font-medium text-slate-700 text-center">{format(new Date(p.at), 'd MMM yyyy')}</p>
            <p className="text-[11px] text-slate-400 text-center">{kg(p.weightKg)} · {p.label}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
