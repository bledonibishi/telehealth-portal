'use client';

import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { kg, kgChange } from '@/lib/weight';
import type { JourneyEntry } from '@/lib/journey-entries';
import { AuthedImage } from '@/components/common/AuthedImage';
import { Icon, type IconName } from '@/components/portal/Icon';
import { useJourneyPhotos } from './JourneyPhotos';

/** The ⋮ in the corner of a card: change it, delete it, download its photo. */
function EntryMenu({ entry, open, onOpen }: { entry: JourneyEntry; open: boolean; onOpen: (open: boolean) => void }) {
  const { edit, remove, download } = useJourneyPhotos();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) onOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, onOpen]);

  const items: { icon: IconName; label: string; run: () => void; danger?: boolean }[] = [];
  if (entry.editable) items.push({ icon: 'pencil', label: 'Edit entry', run: () => edit(entry) });
  if (entry.fileId) items.push({ icon: 'download', label: 'Download photo', run: () => download(entry) });
  if (entry.editable) items.push({ icon: 'trash', label: 'Delete entry', run: () => remove(entry), danger: true });
  if (!items.length) return null;

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Options for the entry from ${format(new Date(entry.at), 'd MMMM yyyy')}`}
        onClick={() => onOpen(!open)}
        // Shown on hover or keyboard focus; always there on a touch screen, which has no hover.
        className={`w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-opacity [@media(hover:none)]:opacity-100 ${open ? 'opacity-100 bg-slate-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
      >
        <Icon name="more" className="w-5 h-5" />
      </button>
      {open && (
        <ul role="menu" className="wj-pop origin-top-right absolute right-0 top-full mt-1 z-20 w-44 bg-white rounded-xl border border-slate-200 shadow-lg py-1">
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => { onOpen(false); item.run(); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left ${item.danger ? 'text-danger-500 hover:bg-danger-50' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                <Icon name={item.icon} className="w-4 h-4" /> {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The note kept with a weighing: folded away until asked for, and written or changed in place. */
function EntryNote({ entry, alwaysOpen = false }: { entry: JourneyEntry; alwaysOpen?: boolean }) {
  const { saveNote } = useJourneyPhotos();
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState(entry.note ?? '');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const start = () => { setText(entry.note ?? ''); setProblem(null); setWriting(true); };
  const save = async () => {
    setSaving(true);
    setProblem(null);
    try { await saveNote(entry, text); setWriting(false); }
    catch (e: any) { setProblem(e?.message ?? 'Couldn’t save the note.'); }
    finally { setSaving(false); }
  };

  if (writing) {
    return (
      <div className="mt-2">
        <label className="sr-only" htmlFor={`note-${entry.key}`}>Note</label>
        <textarea id={`note-${entry.key}`} autoFocus rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="How did this week go?"
          className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
        <div className="flex items-center gap-3 mt-1 text-xs">
          <button type="button" onClick={save} disabled={saving} className="font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save note'}</button>
          <button type="button" onClick={() => setWriting(false)} className="text-slate-400 hover:text-slate-600">Cancel</button>
        </div>
        {problem && <p className="text-xs text-danger-500 mt-1" role="alert">{problem}</p>}
      </div>
    );
  }
  if (!entry.note) {
    return entry.editable ? (
      <button type="button" onClick={start} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-ink-600 hover:text-ink-800"><Icon name="note" className="w-3.5 h-3.5" /> Add note</button>
    ) : null;
  }
  const body = (
    <>
      <p className="text-xs text-slate-600 whitespace-pre-line break-words mt-1">“{entry.note}”</p>
      {entry.editable && <button type="button" onClick={start} className="text-[11px] font-medium text-ink-600 hover:text-ink-800 mt-1">Edit note</button>}
    </>
  );
  if (alwaysOpen) return <div className="mt-2">{body}</div>;
  return (
    <details className="mt-2">
      <summary className="text-xs font-medium text-slate-500 cursor-pointer hover:text-slate-700 inline-flex items-center gap-1"><Icon name="note" className="w-3.5 h-3.5" /> Note</summary>
      {body}
    </details>
  );
}

/** The photo itself, as a button that opens it full screen; a magnifier fades in over it on hover. */
function Photo({ entry, className }: { entry: JourneyEntry; className: string }) {
  const { open, edit } = useJourneyPhotos();
  const date = format(new Date(entry.at), 'd MMMM yyyy');
  if (!entry.fileId) {
    return entry.editable ? (
      <button type="button" onClick={() => edit(entry)} className={`${className} bg-slate-50 hover:bg-ink-50 flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-ink-600 transition-colors`} aria-label={`Add a photo to the entry from ${date}`}>
        <Icon name="camera" className="w-6 h-6" />
        <span className="text-[11px] font-medium">Add photo</span>
      </button>
    ) : (
      <div className={`${className} bg-slate-50 flex items-center justify-center text-slate-300`}><Icon name="camera" className="w-6 h-6" /></div>
    );
  }
  return (
    <button type="button" onClick={() => open(entry)} className={`${className} relative block overflow-hidden group/photo`} aria-label={`Open the photo from ${date} full screen`}>
      <AuthedImage fileId={entry.fileId} alt={`Progress photo, ${date}`} className="w-full h-full object-cover transition-transform duration-300 group-hover/photo:scale-[1.03]" />
      <span className="absolute inset-0 flex items-center justify-center bg-slate-900/0 group-hover/photo:bg-slate-900/30 group-focus-visible/photo:bg-slate-900/30 transition-colors duration-200" aria-hidden>
        <span className="w-10 h-10 rounded-full bg-white/90 text-ink-800 flex items-center justify-center opacity-0 scale-90 group-hover/photo:opacity-100 group-hover/photo:scale-100 group-focus-visible/photo:opacity-100 transition duration-200">
          <Icon name="zoom" className="w-5 h-5" />
        </span>
      </span>
    </button>
  );
}

const shell = 'wj-rise group relative rounded-xl border border-slate-200 bg-white transition duration-200 ease-out hover:-translate-y-1 hover:shadow-[0_8px_25px_rgba(0,0,0,0.12)] hover:border-slate-300';

/** One entry of the journey, as a tile in the grid or a wider row in the list. `order` staggers its arrival. */
export function WeightCard({ entry, view, order }: { entry: JourneyEntry; view: 'grid' | 'list'; order: number }) {
  const { startKg } = useJourneyPhotos();
  const [menuOpen, setMenuOpen] = useState(false);
  const at = new Date(entry.at);
  const style = { animationDelay: `${Math.min(order, 12) * 100}ms` };
  const sinceStart = entry.kind !== 'START' && entry.weightKg !== null && startKg !== null ? Math.round((entry.weightKg - startKg) * 10) / 10 : null;
  const badge = <span className="text-xs font-medium text-slate-600 bg-slate-50 rounded-md px-2 py-1">{entry.label}</span>;

  if (view === 'list') {
    return (
      <li style={style} className={`${shell} p-3 flex gap-4 ${menuOpen ? 'z-10' : ''}`}>
        <Photo entry={entry} className="w-28 sm:w-40 flex-shrink-0 aspect-[4/5] rounded-lg" />
        <div className="min-w-0 flex-1 py-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">{format(at, 'EEEE, d MMMM yyyy')} · {format(at, 'HH:mm')}</p>
              <p className="text-2xl font-bold text-ink-900 mt-0.5">{kg(entry.weightKg)}</p>
            </div>
            <EntryMenu entry={entry} open={menuOpen} onOpen={setMenuOpen} />
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {badge}
            {sinceStart !== null && sinceStart !== 0 && <span className={`text-xs font-medium ${sinceStart < 0 ? 'text-emerald-700' : 'text-slate-500'}`}>{kgChange(sinceStart)} since you started</span>}
          </div>
          <EntryNote entry={entry} alwaysOpen />
        </div>
      </li>
    );
  }

  return (
    <li style={style} className={`${shell} p-3 flex flex-col min-w-0 ${menuOpen ? 'z-10' : ''}`}>
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="text-[11px] text-slate-500 whitespace-nowrap">{format(at, 'd MMM yyyy')}</p>
          <p className="text-base font-bold text-ink-900 whitespace-nowrap">{kg(entry.weightKg)}</p>
        </div>
        <EntryMenu entry={entry} open={menuOpen} onOpen={setMenuOpen} />
      </div>
      <Photo entry={entry} className="mt-2 w-full aspect-[4/5] rounded-lg" />
      <p className="text-center mt-2">{badge}</p>
      <EntryNote entry={entry} />
    </li>
  );
}
