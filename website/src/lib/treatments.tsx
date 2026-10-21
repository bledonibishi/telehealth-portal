import { DICT, type Lang } from './i18n';

const ICON = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

const BASE = [
  {
    key: 'hrt',
    href: '/hrt-eligibility',
    abbr: 'HRT',
    icon: (
      <svg {...ICON}>
        <circle cx="12" cy="9" r="5" />
        <path d="M12 14v7M9 18h6" />
      </svg>
    ),
  },
  {
    key: 'trt',
    href: '/trt-eligibility',
    abbr: 'TRT',
    icon: (
      <svg {...ICON}>
        <circle cx="10" cy="14" r="5" />
        <path d="M19 5l-5.4 5.4M14 5h5v5" />
      </svg>
    ),
  },
  {
    key: 'glp',
    href: '/glp1-eligibility',
    abbr: 'GLP-1',
    icon: (
      <svg {...ICON} stroke="url(#pv-glp-grad)" strokeWidth={2.4}>
        <defs>
          <linearGradient id="pv-glp-grad" gradientUnits="userSpaceOnUse" x1="2" y1="7" x2="22" y2="17">
            <stop offset="0" stopColor="#E5484D" />
            <stop offset=".5" stopColor="#F5A524" />
            <stop offset="1" stopColor="#12A150" />
          </linearGradient>
        </defs>
        <path d="M2 7l6.5 6.5 5-5L22 17" />
        <path d="M16 17h6v-6" />
      </svg>
    ),
  },
];

type Key = 'hrt' | 'trt' | 'glp';

/** The three programmes, as the header and the home page offer them, named in the given language. */
export function treatmentsFor(lang: Lang = 'en') {
  return BASE.map((b) => ({ ...b, ...DICT[lang].treatments[b.key as Key] }));
}

/** The three programmes in English (the default for pages that are English only). */
export const TREATMENTS = treatmentsFor('en');
