'use client';

import { useEffect, useState } from 'react';
import { countByFilter, ENTRY_FILTERS, matchesFilter, type EntryFilter } from '@/lib/journey-entries';
import { Card, CardHeader } from '@/components/portal/Card';
import { Icon } from '@/components/portal/Icon';
import { useJourneyPhotos } from './JourneyPhotos';
import { WeightCard } from './WeightCard';

type View = 'grid' | 'list';
const VIEW_KEY = 'weight-journey.view';
/** With more cards than this, the middle of the journey is folded away until asked for. */
const FOLD_AT = 12;

/** The dashed tile at the end of the cards: a photo with a weight, or just the weight. */
function AddCard({ view }: { view: View }) {
  const { add } = useJourneyPhotos();
  return (
    <li className={`group/add wj-rise relative rounded-md border-2 border-dashed border-ink-600/30 bg-gradient-to-br from-ink-50 to-white hover:border-solid hover:border-ink-600 hover:from-ink-100 hover:to-ink-50 transition-colors duration-200 flex ${view === 'list' ? 'flex-row items-center gap-4 p-4' : 'flex-col items-center justify-center gap-2 p-3 min-h-[12rem]'}`}>
      <span className="w-14 h-14 rounded-full bg-white shadow-sm text-ink-600 flex items-center justify-center transition-transform duration-200 group-hover/add:scale-110" aria-hidden>
        <Icon name="camera" className="w-8 h-8" />
      </span>
      <div className={view === 'list' ? '' : 'text-center'}>
        {/* The whole tile is the "Add Photo" button; "Add weight" sits above it as its own. */}
        <button type="button" onClick={() => add('photo')} className="text-base font-bold text-ink-800 after:absolute after:inset-0 after:rounded-md focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand-500">Add Photo</button>
        <p className="text-xs text-slate-500">with today’s weight</p>
        <button type="button" onClick={() => add('weight')} className="relative z-10 mt-2 inline-flex items-center gap-1 rounded-lg bg-white border border-ink-600/30 hover:border-ink-600 text-ink-700 text-xs font-semibold px-2.5 py-1.5">
          <Icon name="plus" className="w-3.5 h-3.5" /> Add weight
        </button>
      </div>
    </li>
  );
}

/** The journey as cards: filter them, see them as a grid or a list, open a photo, change or delete an entry. */
export function WeightCards() {
  const { entries, photos, loading, add, downloadAll, downloadingAll } = useJourneyPhotos();
  const [filter, setFilter] = useState<EntryFilter>('all');
  const [view, setView] = useState<View>('grid');
  const [showAll, setShowAll] = useState(false);

  // The grid or list choice is remembered on this device.
  useEffect(() => { try { if (localStorage.getItem(VIEW_KEY) === 'list') setView('list'); } catch { /* private mode */ } }, []);
  const chooseView = (v: View) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };

  const counts = countByFilter(entries);
  const matching = entries.filter((e) => matchesFilter(e, filter));
  const folded = !showAll && matching.length > FOLD_AT;
  // Folded: where it began and the latest, which is what the eye compares.
  const shown = folded ? [matching[0], ...matching.slice(-(FOLD_AT - 1))] : matching;
  const toggle = (active: boolean) => `w-9 h-8 flex items-center justify-center ${active ? 'bg-ink-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`;

  return (
    <Card labelledBy="journey-title">
      <CardHeader id="journey-title" title="Weight Journey" subtitle="Track your progress with photos and weight updates.">
        <button type="button" onClick={() => add('photo')} className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-ink-600/40 text-ink-800 hover:bg-ink-50 text-xs font-semibold px-3 py-1.5">
          <Icon name="plus" className="w-3.5 h-3.5" /> Add New Entry
        </button>
      </CardHeader>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
          {ENTRY_FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => { setFilter(f.key); setShowAll(false); }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${filter === f.key ? 'bg-ink-600 border-ink-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {f.label} <span className={filter === f.key ? 'text-white/75' : 'text-slate-400'}>({counts[f.key]})</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {photos.length > 1 && (
            <button type="button" onClick={downloadAll} disabled={downloadingAll} title="Saves a copy of every photo to this device"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 text-xs font-semibold px-3 h-8">
              <Icon name="download" className="w-4 h-4" /> {downloadingAll ? 'Preparing…' : 'Download all (ZIP)'}
            </button>
          )}
          <div role="group" aria-label="Layout" className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button type="button" onClick={() => chooseView('grid')} aria-pressed={view === 'grid'} aria-label="Grid view" title="Grid" className={toggle(view === 'grid')}><Icon name="grid" className="w-4 h-4" /></button>
            <button type="button" onClick={() => chooseView('list')} aria-pressed={view === 'list'} aria-label="List view" title="List" className={toggle(view === 'list')}><Icon name="list" className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {loading && entries.length === 0 && <div className="h-48 rounded-md bg-slate-50 animate-pulse" role="status" aria-label="Loading your journey" />}

      {/* Re-made when the filter or layout changes, so the cards fade in again instead of jumping. */}
      <ul key={`${filter}-${view}`} className={view === 'grid' ? 'grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3' : 'space-y-3'}>
        {shown.map((entry, i) => <WeightCard key={entry.key} entry={entry} view={view} order={i} />)}
        {(filter === 'all' || shown.length === 0) && <AddCard view={view} />}
      </ul>

      {!loading && matching.length === 0 && filter !== 'all' && (
        <p className="text-sm text-slate-500 mt-3">
          {filter === 'after' ? 'Nothing here yet: photos taken once you reach your target weight show up as “After”.' : 'No entries of this kind yet.'}
        </p>
      )}
      {folded && (
        <button type="button" onClick={() => setShowAll(true)} className="mt-3 text-xs font-semibold text-ink-600 hover:text-ink-800">Show all {matching.length} entries</button>
      )}

      <p className="text-[11px] text-slate-400 mt-3 flex items-center gap-1.5"><Icon name="shield" className="w-3.5 h-3.5" /> Only you and your doctor can see your photos.</p>
    </Card>
  );
}
