'use client';

import { SITE_LABEL, SITE_ROTATION, type InjectionSite } from '@/lib/injection-sites';

// Front view, so the patient's left is on the right of the picture.
const ZONES: Record<InjectionSite, { cx: number; cy: number; r: number }> = {
  ABDOMEN_RIGHT: { cx: 51, cy: 100, r: 9 },
  ABDOMEN_LEFT: { cx: 69, cy: 100, r: 9 },
  THIGH_RIGHT: { cx: 50, cy: 148, r: 9 },
  THIGH_LEFT: { cx: 70, cy: 148, r: 9 },
  ARM_RIGHT: { cx: 28, cy: 82, r: 7 },
  ARM_LEFT: { cx: 92, cy: 82, r: 7 },
};

/**
 * A simple body picture with the six injection spots, and the same six as buttons underneath
 * (the buttons are what keyboard and screen-reader users use). `suggested` is ringed.
 */
export function InjectionSitePicker({ value, suggested, last, onChange }: { value: InjectionSite | null; suggested: InjectionSite; last: InjectionSite | null; onChange: (site: InjectionSite) => void }) {
  return (
    <div>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 120 200" className="w-24 flex-shrink-0" role="img" aria-label="Front view of the body with six injection spots">
          <g fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1">
            <circle cx="60" cy="22" r="14" />
            <rect x="40" y="40" width="40" height="70" rx="12" />
            <rect x="20" y="42" width="16" height="58" rx="8" />
            <rect x="84" y="42" width="16" height="58" rx="8" />
            <rect x="42" y="108" width="17" height="80" rx="8" />
            <rect x="61" y="108" width="17" height="80" rx="8" />
          </g>
          {SITE_ROTATION.map((site) => {
            const z = ZONES[site];
            const chosen = value === site;
            return (
              <g key={site}>
                {site === suggested && <circle cx={z.cx} cy={z.cy} r={z.r + 4} fill="none" stroke="#2563eb" strokeWidth="2" strokeDasharray="3 2" />}
                <circle
                  cx={z.cx} cy={z.cy} r={z.r}
                  fill={chosen ? '#2563eb' : site === last ? '#fecaca' : '#ffffff'}
                  stroke={chosen ? '#1d4ed8' : '#94a3b8'} strokeWidth="1.5"
                  className="cursor-pointer" onClick={() => onChange(site)}
                >
                  <title>{SITE_LABEL[site]}</title>
                </circle>
              </g>
            );
          })}
        </svg>
        <div className="text-xs text-slate-500 space-y-1">
          <p><span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-dashed border-blue-600 align-middle mr-1.5" />Try today: <b className="text-slate-800">{SITE_LABEL[suggested].toLowerCase()}</b></p>
          {last && <p><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-200 border border-slate-400 align-middle mr-1.5" />Last time: {SITE_LABEL[last].toLowerCase()}</p>}
          <p className="text-slate-400">Left and right are yours, so your left is on the right of the picture.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3" role="radiogroup" aria-label="Where did you inject?">
        {SITE_ROTATION.map((site) => (
          <button key={site} type="button" role="radio" aria-checked={value === site} onClick={() => onChange(site)}
            className={`text-xs rounded-full border px-3 py-1.5 ${value === site ? 'bg-brand-50 border-brand-500 text-brand-700 font-medium' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {SITE_LABEL[site]}{site === suggested ? ' ★' : ''}
          </button>
        ))}
      </div>
    </div>
  );
}
