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

const primary = 'w-full inline-flex items-center justify-center gap-2.5 rounded-2xl bg-ink-600 hover:bg-ink-700 active:bg-ink-800 disabled:opacity-50 text-white text-base font-semibold py-4 transition-colors';
const outline = 'w-full inline-flex items-center justify-center gap-2.5 rounded-2xl border-2 border-ink-600 text-ink-700 hover:bg-ink-50 disabled:opacity-50 text-base font-semibold py-3.5 transition-colors';

/** The id inside "/uploads/<id>/file", which is how the API names a saved photo. */
export const fileIdOfUrl = (url?: string | null) => url?.match(/\/uploads\/([^/]+)\/file/)?.[1] ?? null;

function Segments({ phase, view, saved }: { phase: Phase; view: PoseView; saved: Record<PoseView, string | null> }) {
  const bars = [
    saved.FRONT ? 100 : phase !== 'done' && view === 'FRONT' ? 45 : 0,
    saved.SIDE ? 100 : phase !== 'done' && view === 'SIDE' ? 45 : 0,
    phase === 'done' ? 100 : 0,
  ];
  return (
    <div className="flex items-center justify-center gap-2" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={bars.filter((b) => b === 100).length} aria-label="Progress through the full body photos">
      {bars.map((w, i) => (
        <span key={i} className="h-2 w-14 rounded-full bg-ink-600/15 overflow-hidden"><span className="block h-full rounded-full bg-ink-600 transition-all duration-500" style={{ width: `${w}%` }} /></span>
      ))}
    </div>
  );
}

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

  const title = phase === 'done' ? 'Your photos' : 'Full body photo';

  return (
    <div className="-mx-4 -mt-6 bg-[#eaf1fd]" style={{ minHeight: 'calc(100dvh - 56px)' }}>
      <div className="px-4 pt-4 pb-5">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={back} aria-label="Back" className="w-11 h-11 rounded-full bg-white shadow-sm flex items-center justify-center text-ink-700 hover:bg-ink-50"><span className="rotate-180 inline-flex"><Icon name="arrow" /></span></button>
          <h1 className="text-base font-semibold text-ink-700">{title}</h1>
          <button type="button" onClick={onExit} aria-label="Save and close" title="Your progress is saved" className="w-11 h-11 rounded-full bg-white shadow-sm flex items-center justify-center text-ink-700 hover:bg-ink-50"><Icon name="close" /></button>
        </div>
        <div className="mt-5"><Segments phase={phase} view={view} saved={saved} /></div>
      </div>

      <div className="bg-white rounded-t-[2rem] px-5 pt-7 pb-10 shadow-[0_-8px_30px_rgba(15,35,82,0.06)]" style={{ minHeight: 'calc(100dvh - 56px - 118px)' }}>
        {/* ── How to stand, and how to take it ─────────────────────────────── */}
        {phase === 'guide' && (
          <div>
            <p className="text-sm text-slate-500">{LABEL[view].of}</p>
            {mustRetake.includes(view) && !saved[view] && (
              <p role="status" className="mt-2 text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">Your earlier {view === 'FRONT' ? 'front' : 'side'} photo didn’t pass our photo check, so we need a new one.</p>
            )}
            {saved.FRONT && view === 'SIDE' && !saved.SIDE && (
              <p className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-full px-3 py-1"><Icon name="check" className="w-3.5 h-3.5" /> Front photo saved</p>
            )}

            <div className="mt-4 rounded-3xl border border-slate-200 p-4">
              <div className="grid grid-cols-2 gap-3">
                <figure className="text-center">
                  <PoseFigure view={view} variant="good" className="h-52" />
                  <figcaption className="mt-3"><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold tracking-wide px-3.5 py-1.5"><Icon name="check" className="w-3.5 h-3.5" /> DO THIS</span></figcaption>
                </figure>
                <figure className="text-center">
                  <PoseFigure view={view} variant="bad" className="h-52" />
                  <figcaption className="mt-3"><span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 text-rose-700 text-xs font-bold tracking-wide px-3.5 py-1.5"><Icon name="close" className="w-3.5 h-3.5" /> AVOID</span></figcaption>
                  <p className="sr-only">{AVOID_CAPTION[view]}</p>
                </figure>
              </div>
              <hr className="my-4 border-slate-100" />
              <ul className="space-y-2.5">
                {CHECKLIST[view].map(([ok, text]) => (
                  <li key={text} className="flex items-center gap-3 text-[15px] text-slate-800">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}><Icon name={ok ? 'check' : 'close'} className="w-3.5 h-3.5" /></span>
                    {text}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 flex items-start gap-3 rounded-2xl bg-gradient-to-b from-slate-50 to-white p-4">
              <span className="w-11 h-11 rounded-full bg-ink-50 text-ink-700 flex items-center justify-center flex-shrink-0"><Icon name="shield" /></span>
              <p className="text-sm text-slate-600 leading-snug">Checks like these are a regulatory requirement so we can give you the best treatment possible. Only you and your doctor can see your photos.</p>
            </div>

            {cameraNote && <p role="status" className="mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">{cameraNote}</p>}
            {problem && <p role="alert" className="mt-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">{problem}</p>}

            <div className="mt-5 space-y-3">
              <button type="button" onClick={takePhoto} className={primary}><Icon name="camera" className="w-5 h-5" /> Take photo</button>
              <button type="button" onClick={() => uploadInput.current?.click()} className={outline}><Icon name="plus" className="w-5 h-5" /> Upload file</button>
              {saved[view] && (
                <button type="button" onClick={keepCurrent} className="w-full text-sm font-medium text-slate-500 hover:text-ink-700 py-2">
                  Keep my current photo
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400 text-center mt-4 leading-snug">We use an automatic check to tell you straight away if a photo can’t be used. A clinician still reviews every photo.</p>
          </div>
        )}

        {/* ── Checking ─────────────────────────────────────────────────────── */}
        {phase === 'checking' && (
          <div className="text-center" role="status" aria-live="polite">
            <p className="text-sm text-slate-500 text-left">{LABEL[view].of}</p>
            <div className="relative mx-auto mt-4 w-full max-w-xs overflow-hidden rounded-3xl bg-slate-100 aspect-[3/4]">
              {attempt?.previewUrl && <img src={attempt.previewUrl} alt="Your photo" className="absolute inset-0 w-full h-full object-contain" />}
              <div className="absolute inset-0 bg-ink-900/25" />
              <span className="scan-line absolute left-0 right-0 h-1 bg-white shadow-[0_0_18px_6px_rgba(255,255,255,0.7)]" style={{ animation: 'scan 1.8s ease-in-out infinite' }} />
            </div>
            <p className="mt-5 text-lg font-semibold text-ink-900">Checking your photo…</p>
            <p className="text-sm text-slate-500 mt-1">This takes a few seconds.</p>
          </div>
        )}

        {/* ── Not usable: say exactly what to fix ───────────────────────────── */}
        {phase === 'failed' && attempt && (
          <div>
            <h2 className="text-[28px] leading-tight font-extrabold text-ink-900 tracking-tight">{attempt.result.outcome === 'UNCHECKED' ? 'We couldn’t check your photo' : `Let’s try your ${view === 'FRONT' ? 'front' : 'side'} photo again`}</h2>
            <p className="text-sm text-slate-500 mt-3">{LABEL[view].of}</p>

            <div className="mt-4 rounded-3xl border border-slate-200 p-4">
              <img src={attempt.previewUrl} alt="The photo that didn’t pass" className="w-full max-h-96 object-contain bg-slate-100 rounded-2xl" />
            </div>

            <div className="mt-4 rounded-2xl bg-amber-50 p-4" role="alert">
              <p className="flex items-center gap-2.5 font-semibold text-amber-950"><Icon name="alert" className="w-5 h-5 text-amber-700" /> {attempt.result.outcome === 'UNCHECKED' ? 'What happened' : 'What our check found'}</p>
              <ul className="mt-2 space-y-1.5 text-[15px] text-amber-950/90">
                {(attempt.result.messages.length ? attempt.result.messages : ['This photo can’t be used']).map((m) => <li key={m}>{m}</li>)}
              </ul>
            </div>

            {problem && <p role="alert" className="mt-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">{problem}</p>}

            <div className="mt-5 space-y-3">
              <button type="button" onClick={retake} className={primary}><Icon name="camera" className="w-5 h-5" /> Retake photo</button>
              <button type="button" onClick={() => { dropAttempt(); setPhase('guide'); uploadInput.current?.click(); }} className={outline}><Icon name="plus" className="w-5 h-5" /> Upload file</button>
              {attempt.result.canSendForReview && (
                <div className="rounded-2xl border border-slate-200 p-4 text-center">
                  <p className="text-sm text-slate-600">Tried a few times? A clinician can look at this photo themselves instead.</p>
                  <button type="button" onClick={() => persist(attempt, true)} className="mt-2 text-sm font-semibold text-ink-700 hover:text-ink-900 underline underline-offset-2">Send it to a clinician</button>
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-400 text-center mt-4">{fails[view] > 1 ? `${fails[view]} tries so far — ` : ''}tips: stand a few steps back, use good light, and let someone help or use the self-timer.</p>
          </div>
        )}

        {/* ── Saved ─────────────────────────────────────────────────────────── */}
        {phase === 'saved' && attempt && (
          <div className="text-center" role="status" aria-live="polite">
            <div className="relative mx-auto w-full max-w-xs overflow-hidden rounded-3xl aspect-[3/4]">
              <img src={attempt.previewUrl} alt="Your photo" className="absolute inset-0 w-full h-full object-contain" />
              <span className="absolute inset-0 bg-emerald-500/20" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xl"><Icon name="check" className="w-10 h-10" /></span>
            </div>
            <p className="mt-5 text-xl font-bold text-ink-900">{attempt.result.outcome === 'PASS' ? 'Looks good!' : attempt.result.outcome === 'FAIL' ? 'Sent to a clinician' : 'Photo saved'}</p>
            <p className="text-sm text-slate-500 mt-1">
              {attempt.result.outcome === 'PASS' ? 'Saved.' : attempt.result.outcome === 'FAIL' ? 'A clinician will look at this photo themselves.' : 'A clinician will check this photo for you.'}
              {view === 'FRONT' && !saved.SIDE ? ' Next: your side photo.' : ''}
            </p>
            <button type="button" onClick={advance} className={`${primary} mt-6`}>{view === 'FRONT' && !saved.SIDE ? 'Continue to side photo' : 'Continue'}</button>
          </div>
        )}

        {/* ── Both saved ────────────────────────────────────────────────────── */}
        {phase === 'done' && (
          <div>
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><Icon name="check" /></span>
              <div>
                <h2 className="text-xl font-bold text-ink-900">Both photos are saved</h2>
                <p className="text-sm text-slate-500">Your doctor reviews them with the rest of your application.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              {(['FRONT', 'SIDE'] as const).map((v) => (
                <figure key={v} className="text-center">
                  {saved[v] && <AuthedImage fileId={saved[v]!} alt={`${LABEL[v].name} photo`} className="w-full aspect-[3/4] object-contain bg-slate-100 rounded-2xl border border-slate-200" />}
                  <figcaption className="mt-2 text-sm font-medium text-slate-700">{LABEL[v].name}</figcaption>
                  <button type="button" onClick={() => retakeView(v)} className="text-xs font-semibold text-ink-600 hover:text-ink-800 mt-0.5">Retake</button>
                </figure>
              ))}
            </div>
            <button type="button" onClick={onFinished} className={`${primary} mt-7`}>Continue</button>
          </div>
        )}
      </div>

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
