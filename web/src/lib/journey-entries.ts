import { differenceInCalendarWeeks } from 'date-fns';

export type EntryFilter = 'all' | 'before' | 'weekly' | 'after';
export type EntryCategory = Exclude<EntryFilter, 'all'>;

/** One card of the journey: a weighing, with or without a photo, or the photo from sign-up. */
export interface JourneyEntry {
  /** Stays the same when the weight or date is changed, so an open photo doesn't close under the patient. */
  key: string;
  /** The weighing behind it; null for the photo from sign-up, which is not a weighing. */
  entryId: string | null;
  kind: 'START' | 'DAILY' | 'CHECK_IN';
  at: string;
  weightKg: number | null;
  fileId: string | null;
  label: string;
  category: EntryCategory;
  note: string | null;
  /** Only the patient's own weigh-ins: not the sign-up photo, a check-in, or an entry their care team corrected. */
  editable: boolean;
}

export interface StartPhoto { fileId: string; at: string; weightKg: number | null }
export interface PhotoRow { entryId: string; measuredAt: string; weightKg: number; photoFileId: string; note?: string | null; patientCanEdit?: boolean }
export interface RecentWeighing { id: string; measuredAt: string; weightKg: number; kind: 'DAILY' | 'CHECK_IN'; note?: string | null; hasPhoto?: boolean; patientCanEdit?: boolean }

const MIN_CARDS = 3;
const day = (iso: string) => new Date(iso).toISOString().slice(0, 10);

/**
 * The journey in order: the sign-up photo as "Before", then every weighing that has a photo. With
 * too few photos to tell the story, recent weigh-ins without one fill the gaps.
 *
 * "After" means at or under the target weight: until the goal is reached there is no "after" yet.
 */
export function buildJourneyEntries({ start, photos, recent, targetKg }: { start: StartPhoto | null; photos: PhotoRow[]; recent: RecentWeighing[]; targetKg: number | null }): JourneyEntry[] {
  const out: JourneyEntry[] = [];
  const reached = (kg: number | null) => targetKg !== null && kg !== null && kg <= targetKg;
  const from = start ? new Date(start.at) : photos[0] ? new Date(photos[0].measuredAt) : recent[0] ? new Date(recent[0].measuredAt) : null;
  const weekOf = (iso: string) => (from ? differenceInCalendarWeeks(new Date(iso), from) : 0);

  if (start) out.push({ key: `f:${start.fileId}`, entryId: null, kind: 'START', at: start.at, weightKg: start.weightKg, fileId: start.fileId, label: 'Before', category: 'before', note: null, editable: false });

  for (const p of photos) {
    const first = out.length === 0;
    const week = weekOf(p.measuredAt);
    out.push({
      key: `f:${p.photoFileId}`,
      entryId: p.entryId,
      kind: 'DAILY',
      at: p.measuredAt,
      weightKg: p.weightKg,
      fileId: p.photoFileId,
      label: first ? 'Before' : week <= 0 ? 'Start' : `Week ${week}`,
      category: first ? 'before' : reached(p.weightKg) ? 'after' : 'weekly',
      note: p.note ?? null,
      // Not an entry their care team corrected: the server refuses those, so the card does not offer it.
      editable: p.patientCanEdit !== false,
    });
  }

  if (out.length < MIN_CARDS) {
    const taken = new Set(out.map((e) => day(e.at)));
    const plain = recent.filter((w) => !w.hasPhoto && !taken.has(day(w.measuredAt)));
    // The first, the middle and the latest, so the few cards still span the journey.
    const picks = [plain[0], plain[Math.floor(plain.length / 2)], plain[plain.length - 1]].filter((w, i, all) => w && all.findIndex((x) => x?.id === w.id) === i);
    for (const w of picks.slice(-(MIN_CARDS - out.length))) {
      const week = weekOf(w.measuredAt);
      out.push({
        key: `w:${w.id}`,
        entryId: w.id,
        kind: w.kind,
        at: w.measuredAt,
        weightKg: w.weightKg,
        fileId: null,
        label: w.kind === 'CHECK_IN' ? 'Check-in' : week > 0 ? `Week ${week}` : 'Weigh-in',
        category: reached(w.weightKg) ? 'after' : 'weekly',
        note: w.note ?? null,
        editable: w.kind === 'DAILY' && w.patientCanEdit !== false,
      });
    }
    out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }
  return out;
}

export const ENTRY_FILTERS: { key: EntryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'before', label: 'Before' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'after', label: 'After' },
];

export const matchesFilter = (entry: JourneyEntry, filter: EntryFilter) => filter === 'all' || entry.category === filter;

export function countByFilter(entries: JourneyEntry[]): Record<EntryFilter, number> {
  const counts: Record<EntryFilter, number> = { all: entries.length, before: 0, weekly: 0, after: 0 };
  for (const e of entries) counts[e.category]++;
  return counts;
}
