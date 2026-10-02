'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@apollo/client';
import { PROGRESS_PHOTOS_FOR_PATIENT } from '@/graphql/weight';
import AuthedImage from '@/components/AuthedImage';
import { kg } from '@/lib/weight';
import { useI18n } from '@/lib/i18n/I18nProvider';

type Photo = { entryId: string; measuredAt: string; weightKg: number; photoFileId: string };
const pathOf = (p: Photo) => `/uploads/${p.photoFileId}/file`;

/** A patient's progress photos, first against latest. For doctors only — the API refuses everyone else, and each photo opened is audited. */
export default function ProgressPhotos({ patientId }: { patientId: string }) {
  const { t, fmt } = useI18n();
  const { data, loading, error } = useQuery(PROGRESS_PHOTOS_FOR_PATIENT, { variables: { patientId }, fetchPolicy: 'cache-and-network' });
  const photos: Photo[] = data?.progressPhotosForPatient ?? [];
  const [pos, setPos] = useState(50);
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);

  useEffect(() => {
    if (!photos.length) return;
    setBeforeId((b) => (b && photos.some((p) => p.entryId === b) ? b : photos[0].entryId));
    setAfterId((a) => (a && photos.some((p) => p.entryId === a) ? a : photos[photos.length - 1].entryId));
  }, [photos]);

  if (error || (!loading && photos.length === 0)) return error ? null : <p className="text-xs text-gray-400">{t('No progress photos.')}</p>;
  const before = photos.find((p) => p.entryId === beforeId) ?? photos[0];
  const after = photos.find((p) => p.entryId === afterId) ?? photos[photos.length - 1];
  if (!before || !after) return null;
  const label = (p: Photo) => `${fmt(p.measuredAt, 'dd MMM yyyy')} · ${kg(p.weightKg)}`;
  const sel = 'border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-full';

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('Progress photos')} · {photos.length}</p>
      {photos.length === 1 ? (
        <AuthedImage path={pathOf(photos[0])} alt={label(photos[0])} className="w-full max-w-xs aspect-[3/4] object-cover rounded-xl" />
      ) : (
        <>
          <div className="relative w-full max-w-sm aspect-[3/4] overflow-hidden rounded-xl bg-gray-100 select-none">
            <AuthedImage path={pathOf(after)} alt={`${t('After')}: ${label(after)}`} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
              <AuthedImage path={pathOf(before)} alt={`${t('Before')}: ${label(before)}`} className="w-full h-full object-cover" />
            </div>
            <span className="absolute left-2 top-2 text-[11px] bg-black/60 text-white rounded-full px-2 py-0.5">{t('Before')} · {label(before)}</span>
            <span className="absolute right-2 top-2 text-[11px] bg-black/60 text-white rounded-full px-2 py-0.5">{t('After')} · {label(after)}</span>
            <div className="absolute inset-y-0 w-0.5 bg-white shadow pointer-events-none" style={{ left: `${pos}%` }} />
            <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label={t('Compare before and after photos')} className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize" />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2 max-w-sm">
            <label className="text-xs text-gray-500">{t('Before')}
              <select className={sel} value={before.entryId} onChange={(e) => setBeforeId(e.target.value)}>{photos.map((p) => <option key={p.entryId} value={p.entryId}>{label(p)}</option>)}</select>
            </label>
            <label className="text-xs text-gray-500">{t('After')}
              <select className={sel} value={after.entryId} onChange={(e) => setAfterId(e.target.value)}>{photos.map((p) => <option key={p.entryId} value={p.entryId}>{label(p)}</option>)}</select>
            </label>
          </div>
        </>
      )}
    </div>
  );
}
