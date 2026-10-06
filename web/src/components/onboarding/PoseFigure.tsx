export type PoseView = 'FRONT' | 'SIDE';
export type PoseVariant = 'good' | 'bad';

const SKIN = '#e9b996';
const SKIN_SHADE = '#d9a47f';

/** A short label for what is wrong in the "avoid" picture, so the picture and the rule are read together. */
export const AVOID_CAPTION: Record<PoseView, string> = { FRONT: 'Hoodies, coats or baggy layers', SIDE: 'Cropped feet or turned to the camera' };

function FrontGood() {
  return (
    <g>
      <ellipse cx="50" cy="196" rx="30" ry="3.5" fill="#0f2352" opacity="0.07" />
      {/* legs and shoes */}
      <rect x="33" y="118" width="14" height="66" rx="6.5" fill={SKIN} />
      <rect x="53" y="118" width="14" height="66" rx="6.5" fill={SKIN} />
      <path d="M31 190c0-5 4-8 9-8h8v8c0 2-1 4-4 4H34c-2 0-3-1-3-4zM69 190c0-5-4-8-9-8h-8v8c0 2 1 4 4 4h11c2 0 3-1 3-4z" fill="#cfd6e4" />
      {/* shorts */}
      <path d="M30 88h40l3 38H53l-3-14-3 14H27z" fill="#3b4256" />
      {/* arms */}
      <rect x="15" y="44" width="12" height="46" rx="6" fill={SKIN} transform="rotate(5 21 44)" />
      <rect x="73" y="44" width="12" height="46" rx="6" fill={SKIN} transform="rotate(-5 79 44)" />
      {/* fitted tee */}
      <path d="M31 38c6-3 32-3 38 0l9 6-3 15-8-2-1 31H34l-1-31-8 2-3-15z" fill="#b9c2d0" />
      <rect x="45" y="29" width="10" height="9" rx="4" fill={SKIN_SHADE} />
      {/* head */}
      <circle cx="50" cy="19" r="12" fill={SKIN} />
      <path d="M38 17c1-9 8-12 14-11 7 1 10 6 10 12-2-4-6-6-12-6s-9 2-12 5z" fill="#3a2a22" />
      <path d="M44 24c3 3 9 3 12 0" stroke="#a8745a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </g>
  );
}

function FrontBad() {
  return (
    <g>
      <ellipse cx="50" cy="196" rx="30" ry="3.5" fill="#0f2352" opacity="0.07" />
      <path d="M24 108h52l4 82H55l-5-50-5 50H20z" fill="#2a2f3d" />
      <path d="M22 190h22v6H20zM56 190h22l2 6H54z" fill="#1c1f29" />
      {/* hoodie */}
      <path d="M14 52c4-14 18-18 36-18s32 4 36 18l6 52-16 4-2-30-1 36H31l-1-36-2 30-16-4z" fill="#3b3f4e" />
      <path d="M33 104h34v20H33z" fill="#333745" />
      <path d="M36 48c2 12 8 18 14 18s12-6 14-18c-5-4-23-4-28 0z" fill="#2a2d39" />
      <circle cx="50" cy="26" r="15" fill="#2a2d39" />
      <circle cx="50" cy="28" r="10.5" fill={SKIN} />
      <path d="M44 31c3 2 9 2 12 0" stroke="#a8745a" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M45 46v12M55 46v12" stroke="#8b90a3" strokeWidth="1.3" strokeLinecap="round" />
    </g>
  );
}

function SideGood() {
  return (
    <g>
      <ellipse cx="50" cy="196" rx="26" ry="3.5" fill="#0f2352" opacity="0.07" />
      {/* back leg */}
      <rect x="44" y="118" width="14" height="66" rx="6.5" fill={SKIN_SHADE} />
      {/* front leg */}
      <rect x="40" y="118" width="14" height="66" rx="6.5" fill={SKIN} />
      <path d="M37 190c0-5 3-8 8-8h12c4 0 7 2 7 6 0 4-2 6-5 6H40c-2 0-3-1-3-4z" fill="#cfd6e4" />
      {/* shorts */}
      <path d="M36 88h26l2 36H38z" fill="#3b4256" />
      {/* torso: slim side profile */}
      <path d="M38 38c7-3 17-3 22 1l3 10-1 41H39l-3-42z" fill="#b9c2d0" />
      <rect x="45" y="29" width="9" height="10" rx="4" fill={SKIN_SHADE} />
      {/* arm hanging */}
      <rect x="43" y="44" width="11" height="46" rx="5.5" fill={SKIN} />
      <path d="M38 40c4-2 12-2 15 0l1 10H39z" fill="#b9c2d0" />
      {/* head in profile, looking ahead */}
      <circle cx="49" cy="19" r="11.5" fill={SKIN} />
      <path d="M59 19l5 3-5 2z" fill={SKIN} />
      <path d="M37 18c0-8 6-12 12-11 7 0 11 5 9 12-3-3-6-4-10-3-4 0-8 1-11 2z" fill="#3a2a22" />
    </g>
  );
}

function SideBad() {
  // Cropped at the knees: the picture ends before the feet, which is exactly what the check turns away.
  return (
    <g>
      <rect x="40" y="118" width="14" height="70" rx="6.5" fill={SKIN} />
      <path d="M36 88h26l2 36H38z" fill="#3b4256" />
      <path d="M38 38c7-3 17-3 22 1l3 10-1 41H39l-3-42z" fill="#b9c2d0" />
      <rect x="45" y="29" width="9" height="10" rx="4" fill={SKIN_SHADE} />
      <rect x="43" y="44" width="11" height="46" rx="5.5" fill={SKIN} />
      <circle cx="49" cy="19" r="11.5" fill={SKIN} />
      <path d="M59 19l5 3-5 2z" fill={SKIN} />
      <path d="M37 18c0-8 6-12 12-11 7 0 11 5 9 12-3-3-6-4-10-3-4 0-8 1-11 2z" fill="#3a2a22" />
      {/* the frame ends here */}
      <rect x="-100" y="150" width="300" height="60" fill="#fdecef" />
      <path d="M-100 150h300" stroke="#e8a3b2" strokeWidth="1.5" strokeDasharray="4 3" />
    </g>
  );
}

/** A flat, friendly figure showing a good (or bad) full-body photo, drawn so the examples need no stock photos. */
export function PoseFigure({ view, variant, className = '' }: { view: PoseView; variant: PoseVariant; className?: string }) {
  const good = variant === 'good';
  return (
    <div className={`relative overflow-hidden rounded-2xl ${good ? 'bg-gradient-to-b from-[#e6f0ff] to-[#d4e3fb]' : 'bg-gradient-to-b from-[#fbe9ee] to-[#f4d3dc]'} ${className}`}>
      <svg viewBox="0 0 100 200" className="w-full h-full" role="img" aria-label={good ? `A good ${view === 'FRONT' ? 'front' : 'side'} photo: head to toe, fitted clothes` : `Avoid: ${AVOID_CAPTION[view].toLowerCase()}`} preserveAspectRatio="xMidYMax meet">
        {view === 'FRONT' ? (good ? <FrontGood /> : <FrontBad />) : good ? <SideGood /> : <SideBad />}
      </svg>
    </div>
  );
}

/** The dashed outline shown over the live camera, so the patient knows how to stand and how far back to be. */
export function PoseOutline({ view, tone = 'neutral' }: { view: PoseView; tone?: 'neutral' | 'good' | 'warn' }) {
  const stroke = tone === 'good' ? 'rgba(110,231,160,0.95)' : tone === 'warn' ? 'rgba(252,211,77,0.95)' : 'rgba(255,255,255,0.85)';
  const front = 'M50 7a12 12 0 1 1 0 24 12 12 0 0 1 0-24zM31 38c6-3 32-3 38 0l9 6 4 46-9 2-3-22-1 36 4 74H61l-4-62h-14l-4 62H31l4-74-1-36-3 22-9-2 4-46z';
  const side = 'M49 7a11.5 11.5 0 1 1 0 23 11.5 11.5 0 0 1 0-23zM38 38c7-3 17-3 22 1l3 10 3 40-8 2-2-20-1 38 2 80H41l-2-60-3 60H27l4-80 2-60z';
  return (
    <svg viewBox="0 0 100 200" className="h-full w-auto max-w-full" aria-hidden>
      <path d={view === 'FRONT' ? front : side} fill="rgba(255,255,255,0.06)" stroke={stroke} strokeWidth="1.2" strokeDasharray="4 3" strokeLinejoin="round" />
    </svg>
  );
}
