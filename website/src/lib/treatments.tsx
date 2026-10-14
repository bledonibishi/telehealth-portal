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

/** The three programmes, as the header and the home page offer them. */
export const TREATMENTS = [
  {
    key: 'hrt',
    href: '/hrt-eligibility',
    name: 'Women’s hormones',
    abbr: 'HRT',
    full: 'Hormone replacement therapy',
    short: 'Women',
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
    name: 'Men’s hormones',
    abbr: 'TRT',
    full: 'Testosterone replacement therapy',
    short: 'Men',
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
    name: 'Weight loss',
    abbr: 'GLP-1',
    full: 'Medical weight management',
    short: 'Weight',
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
