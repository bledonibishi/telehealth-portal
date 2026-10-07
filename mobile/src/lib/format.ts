// Dates and numbers for the screens, in the phone's own language and time zone.

const DAY_MS = 86_400_000;

export const fmtDate = (d: string | Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(d).toLocaleDateString('en-GB', opts);
export const fmtTime = (d: string | Date) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
/** Calendar days from `from` to `to`: 0 is the same day, 1 is tomorrow, -1 is yesterday. */
export const calendarDaysBetween = (to: string | Date, from: Date = new Date()) => Math.round((startOfDay(new Date(to)) - startOfDay(from)) / DAY_MS);

export const isToday = (d: string | Date) => calendarDaysBetween(d) === 0;

/** "today" / "tomorrow" / "in 7 days" / "yesterday" / "2 days ago". */
export function countdown(date: string | Date): string {
  const n = calendarDaysBetween(date);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/** "today at 09:00" / "Tue 6 Oct at 09:00": the real time, not "about 1 hour ago". */
export const takenAtText = (d: string | Date) =>
  `${isToday(d) ? 'today' : fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })} at ${fmtTime(d)}`;

export const hoursSince = (d: string | Date, now: Date = new Date()) => Math.floor((now.getTime() - new Date(d).getTime()) / 3_600_000);
export const kg = (n?: number | null) => (n === null || n === undefined ? '—' : `${Number(n.toFixed(1))} kg`);
export const cm = (n?: number | null) => (n === null || n === undefined ? '—' : `${Number(n.toFixed(1))} cm`);
export const money = (cents: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
};
