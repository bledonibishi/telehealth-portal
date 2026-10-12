/** A drawn injection pen with the medicine's name on the label — no product photos needed. */
export function PenIllustration({ label, className = '' }: { label: string; className?: string }) {
  return (
    <svg viewBox="0 0 160 160" className={className} role="img" aria-label={`${label} injection pen`}>
      <defs>
        <linearGradient id="pen-body" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#eef2f8" />
          <stop offset="1" stopColor="#cfd8e6" />
        </linearGradient>
        <linearGradient id="pen-cap" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#dfe6f1" />
          <stop offset="1" stopColor="#aab6c9" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="140" rx="46" ry="6" fill="#0f2352" opacity="0.08" />
      <g transform="rotate(-55 80 80)">
        <rect x="18" y="66" width="104" height="28" rx="14" fill="url(#pen-body)" stroke="#c3cddd" />
        <rect x="114" y="68" width="30" height="24" rx="10" fill="url(#pen-cap)" stroke="#b3bfd2" />
        <rect x="8" y="71" width="16" height="18" rx="5" fill="#c9d3e2" stroke="#b3bfd2" />
        <rect x="44" y="66" width="46" height="28" fill="#1f4fb8" />
        <path d="M44 66h46v6H44z" fill="#2b62d6" />
        <text x="67" y="84.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="#ffffff" fontFamily="system-ui, sans-serif" letterSpacing="0.3">
          {label.toLowerCase().slice(0, 9)}
        </text>
        <rect x="96" y="74" width="10" height="12" rx="2" fill="#ffffff" stroke="#c3cddd" />
      </g>
    </svg>
  );
}
