'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@apollo/client';
import { CHECK_BODY_PHOTO, CHECK_PHOTO_FRAME, DISCARD_BODY_PHOTO, MY_ONBOARDING, SAVE_BODY_PHOTO } from '@/graphql/onboarding';
import { uploadFile } from '@/lib/upload';
import { prepareProgressPhoto } from '@/lib/image';
import { AuthedImage } from '@/components/common/AuthedImage';
import { Icon } from '@/components/portal/Icon';
import { CameraCapture } from './CameraCapture';
import { AVOID_CAPTION, PoseFigure, type PoseView } from './PoseFigure';

type Phase = 'guide' | 'checking' | 'failed' | 'saved' | 'done';
type Result = { outcome: 'PASS' | 'FAIL' | 'UNCHECKED'; issues: string[]; messages: string[]; canSendForReview: boolean };
type Attempt = { fileId: string; previewUrl: string; result: Result };

const KIND = { FRONT: 'BODY_PHOTO_FRONT', SIDE: 'BODY_PHOTO_SIDE' } as const;
const LABEL: Record<PoseView, { name: string; of: string }> = {
  FRONT: { name: 'Front-facing', of: 'Photo 1 of 2: Front-facing' },
  SIDE: { name: 'Side-facing', of: 'Photo 2 of 2: Side-facing' },
};
const CHECKLIST: Record<PoseView, Array<[boolean, string]>> = {
  FRONT: [[true, 'Face clearly visible'], [true, 'Full body visible, head to toe'], [true, 'Light-coloured, fitted clothing'], [false, 'No hoodies, coats, or baggy layers']],
  SIDE: [[true, 'Turn so your side faces the camera'], [true, 'Full body visible, head to toe'], [true, 'Fitted clothing, arms relaxed at your sides'], [false, 'No hoodies, coats, or baggy layers']],
};

// The same look as the other onboarding steps: plain page, white cards, the standard buttons.
const primary = 'w-full inline-flex items-center justify-center gap-2 bg-ink-700 hover:bg-ink-800 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm transition-colors';
const outline = 'w-full inline-flex items-center justify-center gap-2 border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 text-sm font-medium py-3 rounded-xl transition-colors';
const card = 'bg-white rounded-2xl border border-slate-100 p-4';

/** The id inside "/uploads/<id>/file", which is how the API names a saved photo. */
export const fileIdOfUrl = (url?: string | null) => url?.match(/\/uploads\/([^/]+)\/file/)?.[1] ?? null;

/**
 * The two full-body photos, one after the other: how to stand (with a good and a bad example), a live camera or an
 * upload, an automatic check that says at once what to fix, and each photo saved the moment it passes — so leaving
 * halfway (back, close, sign out) loses nothing and coming back picks up at the photo that is still missing.
 */
export function BodyPhotoFlow({ initial, retake: mustRetake = [], onFinished, onExit }: {
  initial: { FRONT: string | null; SIDE: string | null };
  /** Saved photos that never passed the check: shown again from the top, with a note. */
  retake?: PoseView[];
  onFinished: () => void;
  onExit: () => void;
}) {
  const [saved, setSaved] = useState<Record<PoseView, string | null>>(initial);
  const [view, setView] = useState<PoseView>(initial.FRONT ? 'SIDE' : 'FRONT');
  const [phase, setPhase] = useState<Phase>(initial.FRONT && initial.SIDE ? 'done' : 'guide');
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraNote, setCameraNote] = useState('');
  const [problem, setProblem] = useState('');
  const [fails, setFails] = useState<Record<PoseView, number>>({ FRONT: 0, SIDE: 0 });
  const uploadInput = useRef<HTMLInputElement>(null);
  const captureInput = useRef<HTMLInputElement>(null);

  const [check] = useMutation(CHECK_BODY_PHOTO);
  const [save] = useMutation(SAVE_BODY_PHOTO, { refetchQueries: [{ query: MY_ONBOARDING }] });
  const [discard] = useMutation(DISCARD_BODY_PHOTO);
  const [checkFrame] = useMutation(CHECK_PHOTO_FRAME);

  // A passed photo is shown for a moment, then the flow moves on by itself.
  useEffect(() => {
    if (phase !== 'saved') return;
    const t = setTimeout(() => advance(), 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Object URLs of the photos shown here, let go when the flow is left.
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const advance = () => {
    if (view === 'FRONT' && !saved.SIDE) {
      setView('SIDE');
      setPhase('guide');
    } else if (view === 'FRONT' && saved.SIDE) {
      setPhase('done');
    } else {
      setPhase(saved.FRONT ? 'done' : 'guide');
      if (!saved.FRONT) setView('FRONT');
    }
    setAttempt(null);
  };

  /** A photo that was checked and not kept is deleted, so a failed picture of someone's body doesn't linger. */
  const dropAttempt = () => {
    if (attempt?.fileId) discard({ variables: { fileId: attempt.fileId } }).catch(() => undefined);
    setAttempt(null);
  };

  const keepCurrent = () => {
    if (saved.FRONT && saved.SIDE) setPhase('done');
    else advance();
  };

  const persist = async (a: Attempt, sendForReview: boolean) => {
    setProblem('');
    try {
      await save({ variables: { input: { view, fileId: a.fileId, sendForReview } } });
      setSaved((s) => ({ ...s, [view]: a.fileId }));
      setPhase('saved');
    } catch (err: any) {
      setProblem(err?.message ?? 'We couldn’t save that photo. Please try again.');
      setPhase('failed');
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setProblem('');
    dropAttempt();
    setPhase('checking');
    let previewUrl = '';
    try {
      const prepared = await prepareProgressPhoto(file);
      previewUrl = URL.createObjectURL(prepared);
      urls.current.push(previewUrl);
      setAttempt({ fileId: '', previewUrl, result: { outcome: 'UNCHECKED', issues: [], messages: [], canSendForReview: false } });
      const fileId = await uploadFile(KIND[view], prepared);
      const { data } = await check({ variables: { fileId, view } });
      const result: Result = data.checkBodyPhoto;
      const a = { fileId, previewUrl, result };
      setAttempt(a);
      if (result.outcome === 'FAIL') {
        setFails((f) => ({ ...f, [view]: f[view] + 1 }));
        setPhase('failed');
      } else if (result.outcome === 'UNCHECKED' && result.messages.length) {
        // The check could not run and photos need it: the photo is not saved, and the patient is told why.
        setPhase('failed');
      } else {
        await persist(a, false);
      }
    } catch (err: any) {
      setAttempt(null);
      setProblem(err?.message ?? 'Something went wrong. Please try again.');
      setPhase('guide');
    }
  };

  const takePhoto = () => {
    setProblem('');
    if (cameraNote) captureInput.current?.click(); // the live camera isn't available here: use the phone's own camera app
    else setCameraOpen(true);
  };
  const retake = () => {
    dropAttempt();
    setProblem('');
    setPhase('guide');
    takePhoto();
  };

  const back = () => {
    if (phase === 'guide' && view === 'SIDE' && !saved.SIDE) { setView('FRONT'); return; }
    if (phase === 'guide' && view === 'SIDE' && saved.SIDE && saved.FRONT) { setPhase('done'); return; }
    if (phase === 'guide' && view === 'FRONT' && saved.FRONT && saved.SIDE) { setPhase('done'); return; }
    if (phase === 'failed') { dropAttempt(); setPhase('guide'); return; }
    onExit();
  };

  const retakeView = (v: PoseView) => {
    setView(v);
    setPhase('guide');
    setProblem('');
  };

  return (
    <div>
      <button type="button" onClick={back} className="text-sm text-slate-400 hover:text-slate-600">← Back</button>

      {/* ── How to stand, and how to take it ─────────────────────────────── */}
      {phase === 'guide' && (
        <div>
          <h1 className="text-xl font-bold text-slate-900 mt-4">Full body photo</h1>
          <p className="text-sm text-slate-500 mt-2">{LABEL[view].of}. Checks like these are a regulatory requirement so we can give you the best treatment possible. Only you and your doctor can see your photos.</p>

          {mustRetake.includes(view) && !saved[view] && (
            <p role="status" className="mt-4 text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">Your earlier {view === 'FRONT' ? 'front' : 'side'} photo didn’t pass our photo check, so we need a new one.</p>
          )}
          {saved.FRONT && view === 'SIDE' && !saved.SIDE && (
            <p className="inline-flex items-center gap-1.5 mt-4 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-full px-3 py-1"><Icon name="check" className="w-3.5 h-3.5" /> Front photo saved</p>
          )}

          <div className={`${card} mt-6`}>
            <div className="grid grid-cols-2 gap-3">
              <figure className="text-center">
                <PoseFigure view={view} variant="good" className="h-48" />
                <figcaption className="mt-2.5"><span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold tracking-wide px-3 py-1"><Icon name="check" className="w-3 h-3" /> DO THIS</span></figcaption>
              </figure>
              <figure className="text-center">
                <PoseFigure view={view} variant="bad" className="h-48" />
                <figcaption className="mt-2.5"><span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-700 text-[11px] font-bold tracking-wide px-3 py-1"><Icon name="close" className="w-3 h-3" /> AVOID</span></figcaption>
                <p className="sr-only">{AVOID_CAPTION[view]}</p>
              </figure>
            </div>
            <ul className="space-y-3 mt-4 pt-4 border-t border-slate-100">
              {CHECKLIST[view].map(([ok, text]) => (
                <li key={text} className="flex items-start gap-3">
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs flex-shrink-0 mt-0.5 ${ok ? 'border-ink-500 text-ink-500' : 'border-rose-400 text-rose-500'}`}>{ok ? '✓' : '✕'}</span>
                  <span className="text-sm text-slate-700">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          {cameraNote && <p role="status" className="mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">{cameraNote}</p>}
          {problem && <p role="alert" className="mt-4 text-sm bg-danger-50 border border-danger-100 text-danger-500 rounded-xl px-4 py-3">{problem}</p>}

          <div className="mt-6 space-y-3">
            <button type="button" onClick={takePhoto} className={primary}><Icon name="camera" className="w-4 h-4" /> Take photo</button>
            <button type="button" onClick={() => uploadInput.current?.click()} className={outline}><Icon name="plus" className="w-4 h-4" /> Upload file</button>
            {saved[view] && (
              <button type="button" onClick={keepCurrent} className="w-full text-xs font-medium text-slate-400 hover:text-slate-600 py-1">Keep my current photo</button>
            )}
          </div>
          <p className="text-xs text-slate-400 text-center mt-5">We check each photo automatically so you know straight away if it can’t be used. A clinician still reviews every photo. Your progress is saved as you go.</p>
        </div>
      )}

      {/* ── Checking ─────────────────────────────────────────────────────── */}
      {phase === 'checking' && (
        <div role="status" aria-live="polite">
          <h1 className="text-xl font-bold text-slate-900 mt-4">Checking your photo…</h1>
          <p className="text-sm text-slate-500 mt-2">{LABEL[view].of}. This takes a few seconds.</p>
          <div className={`${card} mt-6`}>
            <div className="relative mx-auto w-full max-w-xs overflow-hidden rounded-xl bg-slate-50 aspect-[3/4]">
              {attempt?.previewUrl && <img src={attempt.previewUrl} alt="Your photo" className="absolute inset-0 w-full h-full object-contain" />}
              <div className="absolute inset-0 bg-ink-900/25" />
              <span className="scan-line absolute left-0 right-0 h-1 bg-white shadow-[0_0_18px_6px_rgba(255,255,255,0.7)]" style={{ animation: 'scan 1.8s ease-in-out infinite' }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Not usable: say exactly what to fix ───────────────────────────── */}
      {phase === 'failed' && attempt && (
        <div>
          <h1 className="text-xl font-bold text-slate-900 mt-4">{attempt.result.outcome === 'UNCHECKED' ? 'We couldn’t check your photo' : `Let’s try your ${view === 'FRONT' ? 'front' : 'side'} photo again`}</h1>
          <p className="text-sm text-slate-500 mt-2">{LABEL[view].of}</p>

          <div className={`${card} mt-6`}>
            <img src={attempt.previewUrl} alt="The photo that didn’t pass" className="w-full max-h-80 object-contain bg-slate-50 rounded-xl" />
          </div>

          <div className="mt-4 rounded-2xl bg-amber-50 border border-amber-100 p-4" role="alert">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-950"><Icon name="alert" className="w-4 h-4 text-amber-700" /> {attempt.result.outcome === 'UNCHECKED' ? 'What happened' : 'What our check found'}</p>
            <ul className="mt-2 space-y-1 text-sm text-amber-950/90">
              {(attempt.result.messages.length ? attempt.result.messages : ['This photo can’t be used']).map((m) => <li key={m}>{m}</li>)}
            </ul>
          </div>

          {problem && <p role="alert" className="mt-4 text-sm bg-danger-50 border border-danger-100 text-danger-500 rounded-xl px-4 py-3">{problem}</p>}

          <div className="mt-6 space-y-3">
            <button type="button" onClick={retake} className={primary}><Icon name="camera" className="w-4 h-4" /> Retake photo</button>
            <button type="button" onClick={() => { dropAttempt(); setPhase('guide'); uploadInput.current?.click(); }} className={outline}><Icon name="plus" className="w-4 h-4" /> Upload file</button>
            {attempt.result.canSendForReview && (
              <div className={`${card} text-center`}>
                <p className="text-sm text-slate-600">Tried a few times? A clinician can look at this photo themselves instead.</p>
                <button type="button" onClick={() => persist(attempt, true)} className="mt-2 text-sm font-semibold text-ink-700 hover:text-ink-900 underline underline-offset-2">Send it to a clinician</button>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 text-center mt-5">{fails[view] > 1 ? `${fails[view]} tries so far — ` : ''}tips: stand a few steps back, use good light, and let someone help or use the self-timer.</p>
        </div>
      )}

      {/* ── Saved ─────────────────────────────────────────────────────────── */}
      {phase === 'saved' && attempt && (
        <div role="status" aria-live="polite">
          <h1 className="text-xl font-bold text-slate-900 mt-4">{attempt.result.outcome === 'PASS' ? 'Looks good!' : attempt.result.outcome === 'FAIL' ? 'Sent to a clinician' : 'Photo saved'}</h1>
          <p className="text-sm text-slate-500 mt-2">
            {attempt.result.outcome === 'PASS' ? 'Saved.' : attempt.result.outcome === 'FAIL' ? 'A clinician will look at this photo themselves.' : 'A clinician will check this photo for you.'}
            {view === 'FRONT' && !saved.SIDE ? ' Next: your side photo.' : ''}
          </p>
          <div className={`${card} mt-6`}>
            <div className="relative mx-auto w-full max-w-xs overflow-hidden rounded-xl bg-slate-50 aspect-[3/4]">
              <img src={attempt.previewUrl} alt="Your photo" className="absolute inset-0 w-full h-full object-contain" />
              <span className="absolute inset-0 bg-emerald-500/15" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xl"><Icon name="check" className="w-8 h-8" /></span>
            </div>
          </div>
          <button type="button" onClick={advance} className={`${primary} mt-6`}>{view === 'FRONT' && !saved.SIDE ? 'Continue to side photo' : 'Continue'}</button>
        </div>
      )}

      {/* ── Both saved ────────────────────────────────────────────────────── */}
      {phase === 'done' && (
        <div>
          <h1 className="text-xl font-bold text-slate-900 mt-4">Your photos</h1>
          <p className="text-sm text-slate-500 mt-2">Both photos are saved. Your doctor reviews them with the rest of your application.</p>
          <div className={`${card} mt-6`}>
            <div className="grid grid-cols-2 gap-3">
              {(['FRONT', 'SIDE'] as const).map((v) => (
                <figure key={v} className="text-center">
                  {saved[v] && <AuthedImage fileId={saved[v]!} alt={`${LABEL[v].name} photo`} className="w-full aspect-[3/4] object-contain bg-slate-50 rounded-xl border border-slate-100" />}
                  <figcaption className="mt-2 text-sm font-medium text-slate-700">{LABEL[v].name}</figcaption>
                  <button type="button" onClick={() => retakeView(v)} className="text-xs font-medium text-ink-600 hover:text-ink-800 mt-0.5">Retake</button>
                </figure>
              ))}
            </div>
          </div>
          <button type="button" onClick={onFinished} className={`${primary} mt-6`}>Continue</button>
        </div>
      )}

      {cameraOpen && (
        <CameraCapture
          view={view}
          onClose={() => setCameraOpen(false)}
          onCapture={(file) => { setCameraOpen(false); handleFile(file); }}
          onFrame={async (image) => (await checkFrame({ variables: { view, image } })).data.checkPhotoFrame}
          onUnavailable={(reason) => { setCameraOpen(false); setCameraNote(reason); }}
        />
      )}
      <input ref={uploadInput} type="file" accept="image/*" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={captureInput} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}
