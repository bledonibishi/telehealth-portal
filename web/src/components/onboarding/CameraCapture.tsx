'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PoseOutline, type PoseView } from './PoseFigure';

type Facing = 'user' | 'environment';
const TIMERS = [0, 5, 10] as const;
const MAX_SIDE = 1600;

const GUIDE: Record<PoseView, string> = {
  FRONT: 'Stand facing the camera, arms relaxed. Fit your whole body — head to toe — inside the outline.',
  SIDE: 'Turn so your side faces the camera and look straight ahead. Fit your whole body inside the outline.',
};

/** Why the camera could not start, in words the patient can act on. */
function explain(err: unknown): string {
  const name = (err as DOMException)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access is blocked. Allow it in your browser’s settings, or upload a photo instead.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device. You can upload a photo instead.';
  if (name === 'NotReadableError') return 'Your camera is being used by another app. Close it and try again, or upload a photo.';
  return 'The camera couldn’t start. You can upload a photo instead.';
}

/**
 * A live camera for the full-body photos: a body outline to stand in, a self-timer (so the phone can be propped
 * up and the patient can step back), and a front/back camera switch. Hands back a JPEG file; the caller decides
 * what to do with it. If the camera can't be used at all, `onUnavailable` says why and the caller offers an upload.
 */
export type LiveGuidance = { available: boolean; ready: boolean; messages: string[] };
const FRAME_SIDE = 480;
const FRAME_EVERY_MS = 1200;

export function CameraCapture({ view, onCapture, onClose, onUnavailable, onFrame }: {
  view: PoseView;
  /** Live guidance: asked about a small frame every second or so while the camera is open. */
  onFrame?: (jpegBase64: string) => Promise<LiveGuidance>;
  onCapture: (file: File) => void;
  onClose: () => void;
  onUnavailable: (reason: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing>('user');
  const [ready, setReady] = useState(false);
  const [canFlip, setCanFlip] = useState(false);
  const [timer, setTimer] = useState<(typeof TIMERS)[number]>(0);
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const [live, setLive] = useState<LiveGuidance | null>(null);
  const frameFn = useRef(onFrame);
  frameFn.current = onFrame;

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    stop();
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        onUnavailable('Live camera needs a secure connection. You can upload a photo instead.');
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => undefined);
        }
        setReady(true);
        setCanFlip((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput').length > 1);
      } catch (err) {
        if (!cancelled) onUnavailable(explain(err));
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
    // onUnavailable is the caller's inline function; the camera must restart only when the lens changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing, stop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (tick.current) clearInterval(tick.current);
    };
  }, [onClose]);

  // Live guidance: while the camera is on, ask about a small frame, one at a time, and show what to fix.
  // Stops by itself if the check says it has nothing to offer (not set up, rate limited, an outage).
  useEffect(() => {
    if (!ready || !frameFn.current) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      const v = video.current;
      const ask = frameFn.current;
      if (!alive || !v || !ask) return;
      if (v.videoWidth && !document.hidden) {
        const scale = FRAME_SIDE / Math.max(v.videoWidth, v.videoHeight);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height);
        try {
          const result = await ask(canvas.toDataURL('image/jpeg', 0.6).split(',')[1]);
          if (!alive) return;
          if (!result.available) return setLive(null);
          setLive(result);
        } catch {
          if (alive) setLive(null);
          return; // guidance is a help, not a requirement: no retries, no errors
        }
      }
      timer = setTimeout(loop, FRAME_EVERY_MS);
    };
    timer = setTimeout(loop, 600);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [ready, facing]);

  const snap = useCallback(() => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height);
    setFlash(true);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(new File([blob], `${view.toLowerCase()}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.9,
    );
  }, [onCapture, view]);

  const shutter = () => {
    if (count !== null) {
      // A second tap cancels the countdown.
      if (tick.current) clearInterval(tick.current);
      setCount(null);
      return;
    }
    if (timer === 0) return snap();
    let left: number = timer;
    setCount(left);
    tick.current = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        if (tick.current) clearInterval(tick.current);
        setCount(null);
        snap();
      } else {
        setCount(left);
      }
    }, 1000);
  };

  const cycleTimer = () => setTimer((t) => TIMERS[(TIMERS.indexOf(t) + 1) % TIMERS.length]);
  const round = 'w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur text-white flex items-center justify-center';

  return (
    <div role="dialog" aria-modal="true" aria-label="Camera" className="fixed inset-0 z-50 bg-black flex flex-col" style={{ height: '100dvh' }}>
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {/* The preview of the front camera is mirrored, like a mirror; the saved photo is not, like the phone's own camera. */}
        <video ref={video} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }} />
        {!ready && <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70" role="status">Starting camera…</div>}

        <div className="absolute inset-0 flex items-center justify-center px-6 pt-28 pb-4 pointer-events-none" aria-hidden>
          <PoseOutline view={view} tone={live ? (live.ready ? 'good' : 'warn') : 'neutral'} />
        </div>

        <div className="absolute top-0 inset-x-0 p-4 flex items-start justify-between gap-3" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
          <button type="button" onClick={onClose} aria-label="Close camera" className={round}>✕</button>
          <p className="flex-1 text-center text-[13px] leading-snug text-white bg-black/45 backdrop-blur rounded-md px-3 py-2 max-w-sm">{GUIDE[view]}</p>
          <span className="w-11" aria-hidden />
        </div>

        {live && count === null && (
          <div className="absolute inset-x-0 bottom-3 px-4 flex justify-center pointer-events-none" role="status" aria-live="polite">
            {live.ready ? (
              <p className="inline-flex items-center gap-2 rounded-full bg-emerald-500 text-white text-sm font-semibold px-4 py-2 shadow-lg">✓ Looks good — take the photo</p>
            ) : (
              <ul className="max-w-sm rounded-lg bg-amber-400/95 text-amber-950 text-[13px] font-medium px-4 py-2.5 shadow-lg space-y-0.5">
                {live.messages.slice(0, 2).map((m) => <li key={m}>{m}</li>)}
              </ul>
            )}
          </div>
        )}

        {count !== null && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" role="status" aria-live="assertive">
            <span key={count} className="text-white font-bold drop-shadow-lg animate-pulse" style={{ fontSize: '9rem', lineHeight: 1 }}>{count}</span>
          </div>
        )}
        {flash && <div className="absolute inset-0 bg-white animate-[fadeout_300ms_ease-out_forwards]" onAnimationEnd={() => setFlash(false)} />}
      </div>

      <div className="bg-black px-6 pt-4 flex items-center justify-between" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
        <button type="button" onClick={cycleTimer} aria-label={timer ? `Self-timer ${timer} seconds` : 'Self-timer off'} className={`${round} text-xs font-semibold w-14`}>
          ⏱ {timer ? `${timer}s` : 'Off'}
        </button>
        <button type="button" onClick={shutter} disabled={!ready} aria-label={count !== null ? 'Cancel the countdown' : 'Take photo'}
          className="w-[72px] h-[72px] rounded-full border-4 border-white flex items-center justify-center disabled:opacity-40">
          <span className={`block rounded-full bg-white transition-all ${count !== null ? 'w-6 h-6 rounded-md' : 'w-14 h-14'}`} />
        </button>
        {canFlip ? (
          <button type="button" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} aria-label="Switch camera" className={`${round} w-14`}>⟲</button>
        ) : (
          <span className="w-14" aria-hidden />
        )}
      </div>
    </div>
  );
}
