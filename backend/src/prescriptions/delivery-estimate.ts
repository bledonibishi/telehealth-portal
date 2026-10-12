const day = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const dayNoMonth = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric' });

/** The courier's window in words for a patient: "Monday 13 October", or "Monday 13 – Tuesday 14 October". Null with no date. */
export function describeEstimate(from?: Date | null, to?: Date | null): string | null {
  const a = from ?? to;
  const b = to ?? from;
  if (!a || !b) return null;
  if (a.toDateString() === b.toDateString()) return day(a);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  return sameMonth ? `${dayNoMonth(a)} – ${day(b)}` : `${day(a)} – ${day(b)}`;
}
