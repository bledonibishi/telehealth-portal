'use client';

import { useRef, useState } from 'react';
import { useMutation } from '@apollo/client';
import { format } from 'date-fns';
import { EDIT_MY_WEIGHT, WEIGHT_REFETCH } from '@/graphql/weight';
import { uploadFile } from '@/lib/upload';
import { prepareProgressPhoto } from '@/lib/image';
import { announceWeightsChanged } from '@/lib/weights-changed';
import type { JourneyEntry } from '@/lib/journey-entries';
import { AuthedImage } from '@/components/common/AuthedImage';

const MIN_KG = 30;
const MAX_KG = 300;
const field = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500';
const toLocal = (iso: string) => format(new Date(iso), "yyyy-MM-dd'T'HH:mm");

/**
 * Change the weight, date, note or photo of one of the patient's own weigh-ins. Only what was
 * actually changed is sent, and nothing at all when nothing was. The original is never
 * overwritten: their care team keeps it on record.
 */
export function EditEntryForm({ entry, onDone }: { entry: JourneyEntry; onDone: () => void }) {
  const initialWeight = entry.weightKg === null ? '' : String(Number(entry.weightKg.toFixed(1)));
  const initialWhen = toLocal(entry.at);
  const [weight, setWeight] = useState(initialWeight);
  const [when, setWhen] = useState(initialWhen);
  const [note, setNote] = useState(entry.note ?? '');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Uploaded once and kept across retries, so a failed save doesn't upload the same photo twice.
  const uploaded = useRef<{ file: File; id: string } | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [save, { loading }] = useMutation(EDIT_MY_WEIGHT, { refetchQueries: WEIGHT_REFETCH, awaitRefetchQueries: true });

  const choosePhoto = (file: File | undefined) => {
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    setRemovePhoto(false);
    uploaded.current = null;
    setProblem(null);
  };
  const dropNewPhoto = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(null);
    setPreview(null);
    uploaded.current = null;
    if (photoInput.current) photoInput.current.value = '';
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const kgValue = Number(weight);
    const at = new Date(when);
    if (!weight.trim() || !Number.isFinite(kgValue)) return setProblem('Please enter your weight.');
    if (kgValue < MIN_KG || kgValue > MAX_KG) return setProblem(`Please enter a weight between ${MIN_KG} and ${MAX_KG} kg.`);
    if (!when || Number.isNaN(at.getTime())) return setProblem('Please choose a date and time.');
    if (at.getTime() > Date.now() + 5 * 60_000) return setProblem('The date and time can’t be in the future.');
    setProblem(null);

    const input: Record<string, unknown> = { entryId: entry.entryId };
    if (weight.trim() !== initialWeight) input.weightKg = kgValue;
    // The field only holds minutes: sent untouched, it would round the seconds off the time the weight was taken.
    if (when !== initialWhen) input.measuredAt = at.toISOString();
    if (note.trim() !== (entry.note ?? '')) input.note = note.trim();
    try {
      if (photo) {
        if (uploaded.current?.file !== photo) {
          setUploading(true);
          try {
            uploaded.current = { file: photo, id: await uploadFile('PROGRESS_PHOTO', await prepareProgressPhoto(photo)) };
          } catch (err: any) {
            return setProblem(`Couldn’t upload the photo: ${err?.message ?? 'please try again'}.`);
          } finally {
            setUploading(false);
          }
        }
        input.photoFileId = uploaded.current.id;
      } else if (removePhoto && entry.fileId) {
        input.removePhoto = true;
      }
      if (Object.keys(input).length > 1) {
        await save({ variables: { input } });
        announceWeightsChanged();
      }
      onDone();
    } catch (err: any) {
      setProblem(err?.message ?? 'Couldn’t save that. Please try again.');
    }
  };

  const showsCurrent = !!entry.fileId && !photo && !removePhoto;
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid sm:grid-cols-[9rem_1fr] gap-3">
        <div>
          <label htmlFor="edit-weight" className="block text-xs font-medium text-slate-500 mb-1">Weight (kg)</label>
          <input id="edit-weight" type="number" inputMode="decimal" step="0.1" min={MIN_KG} max={MAX_KG} value={weight} onChange={(e) => setWeight(e.target.value)} className={field} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="edit-when" className="block text-xs font-medium text-slate-500 mb-1">Date and time</label>
          <input id="edit-when" type="datetime-local" value={when} max={toLocal(new Date().toISOString())} onChange={(e) => setWhen(e.target.value)} className={field} />
        </div>
      </div>

      <div>
        <label htmlFor="edit-note" className="block text-xs font-medium text-slate-500 mb-1">Note (optional)</label>
        <textarea id="edit-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={field} />
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500 mb-1">Photo</p>
        <input ref={photoInput} id="edit-photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" onChange={(e) => choosePhoto(e.target.files?.[0])} />
        <div className="flex items-center gap-3">
          {showsCurrent && <AuthedImage fileId={entry.fileId!} alt="The photo saved with this weight" className="w-14 h-[4.5rem] object-cover rounded-lg border border-slate-200" />}
          {preview && <img src={preview} alt="The new photo, ready to save" className="w-14 h-[4.5rem] object-cover rounded-lg border border-slate-200" />}
          <div className="text-xs space-y-1">
            {removePhoto && !photo && <p className="text-slate-500">The photo will be removed when you save.</p>}
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <label htmlFor="edit-photo" className="font-medium text-brand-600 hover:text-brand-700 cursor-pointer">{showsCurrent || photo ? 'Replace photo' : 'Add a photo'}</label>
              {photo && <button type="button" onClick={dropNewPhoto} className="text-slate-400 hover:text-slate-600 underline">Undo</button>}
              {showsCurrent && <button type="button" onClick={() => setRemovePhoto(true)} className="text-slate-400 hover:text-danger-500 underline">Remove photo</button>}
              {removePhoto && !photo && <button type="button" onClick={() => setRemovePhoto(false)} className="text-slate-400 hover:text-slate-600 underline">Keep it</button>}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={loading || uploading} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-3 rounded-xl">
          {uploading ? 'Uploading photo…' : loading ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-slate-400 hover:text-slate-600">Cancel</button>
      </div>
      <p className="text-[11px] text-slate-400">If you change the weight or date, your care team can still see what it was before.</p>
      {problem && <p className="text-sm text-danger-500" role="alert">{problem}</p>}
    </form>
  );
}
