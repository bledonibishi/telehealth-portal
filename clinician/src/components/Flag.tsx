import { useId } from 'react';
import type { Locale } from '@/lib/i18n/locales';

// Flags are drawn as SVG rather than emoji: Windows has no flag emoji and shows the letters "GB" instead.
// All share a 7:5 box, so they sit evenly side by side.

function Albania() {
  return (
    <>
      <rect width="28" height="20" fill="#e41e20" />
      <g fill="#000">
        {/* body and tail */}
        <path d="M14 7.4c-1.5 0-2.3 1.3-2.1 3.1l.7 4 1.4 1.5 1.4-1.5.7-4c.2-1.8-.6-3.1-2.1-3.1z" />
        {/* wings, mirrored */}
        <path d="M12 8.6 8.7 5.4l-.4 1.8-1.4-.8.2 2-1.4.2 1 1.6-1.2.8 2 1.2-.8 1.4 2.8-.4 2.5-1z" />
        <path d="M16 8.6l3.3-3.2.4 1.8 1.4-.8-.2 2 1.4.2-1 1.6 1.2.8-2 1.2.8 1.4-2.8-.4-2.5-1z" />
        {/* the two heads and beaks */}
        <circle cx="12.5" cy="6.3" r="1.2" />
        <circle cx="15.5" cy="6.3" r="1.2" />
        <path d="M11.4 6.1 10 6.7l1.5.3zM16.6 6.1 18 6.7l-1.5.3z" />
        {/* legs */}
        <path d="M13 15.2v1.6h-1.1zM15 15.2v1.6h1.1z" />
      </g>
    </>
  );
}

function UnitedKingdom({ uid }: { uid: string }) {
  return (
    <svg viewBox="0 0 60 30" width="28" height="20" preserveAspectRatio="xMidYMid slice" x="0" y="0">
      <clipPath id={`${uid}-s`}><path d="M0,0 v30 h60 v-30 z" /></clipPath>
      <clipPath id={`${uid}-t`}><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath>
      <g clipPath={`url(#${uid}-s)`}>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${uid}-t)`} stroke="#c8102e" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
      </g>
    </svg>
  );
}

function Germany() {
  return (
    <>
      <rect width="28" height="20" fill="#ffce00" />
      <rect width="28" height="13.34" fill="#dd0000" />
      <rect width="28" height="6.67" fill="#000" />
    </>
  );
}

function Spain() {
  return (
    <>
      <rect width="28" height="20" fill="#aa151b" />
      <rect y="5" width="28" height="10" fill="#f1bf00" />
    </>
  );
}

export default function Flag({ code, className = 'w-6 h-[17px]' }: { code: Locale; className?: string }) {
  const uid = useId().replace(/:/g, '');
  return (
    <span className={`inline-block shrink-0 overflow-hidden rounded-[3px] ring-1 ring-black/15 ${className}`} aria-hidden>
      {code === 'en' ? (
        <UnitedKingdom uid={uid} />
      ) : (
        <svg viewBox="0 0 28 20" className="block w-full h-full" preserveAspectRatio="none">
          {code === 'sq' && <Albania />}
          {code === 'de' && <Germany />}
          {code === 'es' && <Spain />}
        </svg>
      )}
    </span>
  );
}
