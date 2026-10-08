'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useMutation } from '@apollo/client';
import { format } from 'date-fns';
import { EDIT_MY_WEIGHT, VOID_MY_WEIGHT, WEIGHT_REFETCH } from '@/graphql/weight';
import { downloadAllPhotos, downloadPhoto } from '@/lib/download';
import { useJourneyEntries } from '@/lib/useJourneyEntries';
import { announceWeightsChanged } from '@/lib/weights-changed';
import { kg } from '@/lib/weight';
import type { JourneyEntry } from '@/lib/journey-entries';
import { Dialog } from '@/components/common/Dialog';
import { LogWeightForm } from './LogWeightForm';
import { EditEntryForm } from './EditEntryForm';
import { PhotoLightbox } from './PhotoLightbox';

interface JourneyPhotos {
  entries: JourneyEntry[];
  /** Only the entries that have a picture, in the order the full-screen view steps through them. */
  photos: JourneyEntry[];
  loading: boolean;
  startKg: number | null;
  open: (entry: JourneyEntry) => void;
  edit: (entry: JourneyEntry) => void;
  remove: (entry: JourneyEntry) => void;
  download: (entry: JourneyEntry) => void;
  downloadAll: () => void;
  downloadingAll: boolean;
  add: (what: 'photo' | 'weight') => void;
  saveNote: (entry: JourneyEntry, note: string) => Promise<void>;
}

const Context = createContext<JourneyPhotos | null>(null);

export function useJourneyPhotos(): JourneyPhotos {
  const value = useContext(Context);
  if (!value) throw new Error('useJourneyPhotos must be used inside <JourneyPhotosProvider>');
  return value;
}

/**
 * The journey's entries and what can be done with one (open it full screen, change it, delete it,
 * download it), shared by the cards, the comparison and the photo timeline, so there is one
 * full-screen view and one set of dialogs on the page, whichever of them was clicked.
 */
export function JourneyPhotosProvider({ journey, children }: { journey: any; children: React.ReactNode }) {
  const { entries, loading } = useJourneyEntries(journey);
  const photos = useMemo(() => entries.filter((e) => e.fileId), [entries]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<JourneyEntry | null>(null);
  const [deleting, setDeleting] = useState<JourneyEntry | null>(null);
  const [adding, setAdding] = useState<'photo' | 'weight' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [voidWeight, { loading: voiding }] = useMutation(VOID_MY_WEIGHT, { refetchQueries: WEIGHT_REFETCH, awaitRefetchQueries: true });
  const [editWeight] = useMutation(EDIT_MY_WEIGHT, { refetchQueries: WEIGHT_REFETCH, awaitRefetchQueries: true });

  const openIndex = openKey ? photos.findIndex((p) => p.key === openKey) : -1;
  // The open photo is gone (deleted, or its picture removed): there is nothing left to show.
  useEffect(() => { if (openKey && !loading && openIndex === -1) setOpenKey(null); }, [openKey, openIndex, loading]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const download = useCallback((entry: JourneyEntry) => {
    if (!entry.fileId) return;
    downloadPhoto({ fileId: entry.fileId, at: entry.at, weightKg: entry.weightKg, label: entry.label }).catch(() => setNotice('Couldn’t download that photo. Please try again.'));
  }, []);

  const downloadAll = useCallback(() => {
    if (!photos.length || downloadingAll) return;
    setDownloadingAll(true);
    downloadAllPhotos(photos.map((p) => ({ fileId: p.fileId!, at: p.at, weightKg: p.weightKg, label: p.label })))
      .then(() => setNotice(`${photos.length} photos saved to this device as a ZIP file.`))
      .catch(() => setNotice('Couldn’t download your photos. Please try again.'))
      .finally(() => setDownloadingAll(false));
  }, [photos, downloadingAll]);

  const saveNote = useCallback(async (entry: JourneyEntry, note: string) => {
    if (!entry.entryId) return;
    await editWeight({ variables: { input: { entryId: entry.entryId, note: note.trim() } } });
    announceWeightsChanged();
  }, [editWeight]);

  const confirmDelete = async () => {
    if (!deleting?.entryId) return;
    setDeleteError(null);
    try {
      // If its photo is the one open, step to a neighbour rather than closing the view.
      const neighbour = openKey === deleting.key ? (photos[openIndex + 1] ?? photos[openIndex - 1])?.key ?? null : openKey;
      await voidWeight({ variables: { entryId: deleting.entryId } });
      setOpenKey(neighbour);
      announceWeightsChanged();
      setDeleting(null);
    } catch (e: any) {
      setDeleteError(e?.message ?? 'Couldn’t delete that entry. Please try again.');
    }
  };

  const value = useMemo<JourneyPhotos>(() => ({
    entries, photos, loading, startKg: journey.startingWeightKg ?? null,
    open: (entry) => entry.fileId && setOpenKey(entry.key),
    edit: (entry) => entry.editable && setEditing(entry),
    remove: (entry) => { if (entry.editable) { setDeleteError(null); setDeleting(entry); } },
    download, downloadAll, downloadingAll,
    add: setAdding,
    saveNote,
  }), [entries, photos, loading, journey.startingWeightKg, download, downloadAll, downloadingAll, saveNote]);

  return (
    <Context.Provider value={value}>
      {children}

      {openIndex >= 0 && (
        <PhotoLightbox
          photos={photos}
          index={openIndex}
          onIndex={(i) => setOpenKey(photos[i].key)}
          onClose={() => setOpenKey(null)}
          onEdit={value.edit}
          onDelete={value.remove}
          onDownload={download}
          startKg={journey.startingWeightKg}
          suspended={!!editing || !!deleting}
        />
      )}

      {adding && (
        <Dialog title={adding === 'photo' ? 'Add a weight and photo' : 'Add a weight'} onClose={() => setAdding(null)}>
          <LogWeightForm withPhoto={adding === 'photo'} onSaved={() => setAdding(null)} onCancel={() => setAdding(null)} />
        </Dialog>
      )}

      {editing && (
        <Dialog title={`Edit entry · ${format(new Date(editing.at), 'd MMM yyyy')}`} onClose={() => setEditing(null)}>
          <EditEntryForm entry={editing} onDone={() => setEditing(null)} />
        </Dialog>
      )}

      {deleting && (
        <Dialog title="Are you sure?" onClose={() => setDeleting(null)}>
          <p className="text-sm text-slate-600">
            Delete the entry from <b className="text-slate-800">{format(new Date(deleting.at), 'd MMMM yyyy')}</b> ({kg(deleting.weightKg)})?
            {deleting.fileId ? ' The weight leaves your journey and its photo is erased.' : ' The weight leaves your journey.'}
          </p>
          <p className="text-xs text-slate-400 mt-2">Your care team keeps a note that this weight was recorded and removed. This can’t be undone here.</p>
          {deleteError && <p className="text-sm text-danger-500 mt-2" role="alert">{deleteError}</p>}
          <div className="flex justify-end gap-2 mt-5">
            <button type="button" onClick={() => setDeleting(null)} className="text-sm text-slate-500 hover:bg-slate-100 rounded-xl px-4 py-2.5">Keep it</button>
            <button type="button" onClick={confirmDelete} disabled={voiding} className="text-sm font-semibold text-white bg-danger-500 hover:bg-danger-900 disabled:opacity-50 rounded-xl px-4 py-2.5">{voiding ? 'Deleting…' : 'Delete entry'}</button>
          </div>
        </Dialog>
      )}

      {notice && (
        <p role="status" className="wj-fade fixed z-[60] bottom-4 left-1/2 -translate-x-1/2 max-w-[calc(100vw-2rem)] bg-slate-900 text-white text-sm rounded-xl shadow-lg px-4 py-2.5">{notice}</p>
      )}
    </Context.Provider>
  );
}
