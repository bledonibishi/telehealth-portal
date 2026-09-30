// One colour per medicine, so a row reads at a glance: Mounjaro red, Ozempic
// orange, Wegovy blue. Matched on the brand (or medicine name) the API returns.
const STYLES: { match: RegExp; cls: string; dot: string; solid: string }[] = [
  { match: /mounjaro|tirzepatide|zepbound/i, cls: 'bg-red-100 text-red-700 ring-red-200', dot: 'bg-red-500', solid: 'bg-red-500 text-white' },
  { match: /ozempic/i, cls: 'bg-orange-100 text-orange-700 ring-orange-200', dot: 'bg-orange-500', solid: 'bg-orange-500 text-white' },
  { match: /wegovy/i, cls: 'bg-blue-100 text-blue-700 ring-blue-200', dot: 'bg-blue-500', solid: 'bg-blue-500 text-white' },
  { match: /semaglutide|saxenda|liraglutide/i, cls: 'bg-indigo-100 text-indigo-700 ring-indigo-200', dot: 'bg-indigo-500', solid: 'bg-indigo-500 text-white' },
  // Hormone programmes
  { match: /oestrogel|sandrena|evorel|estradiol|utrogestan|progesterone/i, cls: 'bg-violet-100 text-violet-700 ring-violet-200', dot: 'bg-violet-500', solid: 'bg-violet-500 text-white' },
  { match: /tostran|sustanon|testopel|testosterone/i, cls: 'bg-teal-100 text-teal-700 ring-teal-200', dot: 'bg-teal-500', solid: 'bg-teal-600 text-white' },
];
const FALLBACK = { cls: 'bg-gray-100 text-gray-700 ring-gray-200', dot: 'bg-gray-400', solid: 'bg-slate-600 text-white' };

export function medicationStyle(label: string) {
  return STYLES.find((s) => s.match.test(label)) ?? FALLBACK;
}
