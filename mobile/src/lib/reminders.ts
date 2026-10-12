import { calendarDaysBetween, fmtDate, fmtTime } from './format';

export type Reminder = { key: string; icon: string; title: string; detail: string; href: string };

const DAY = 86_400_000;

type Inputs = {
  appointments?: Array<{ id: string; status: string; scheduledFor?: string | null }>;
  plan?: { productName?: string | null; strength?: string | null; nextDoseAt?: string | null; validUntil?: string | null } | null;
  supply?: { refillState?: string | null } | null;
};

/**
 * What the patient still has to do, worked out from their own data and gone once it is done: an appointment in the next
 * two days, a dose due, a supply to order, a prescription running out. (What *happened* is a notification instead.)
 * The same rules as the web portal's bell.
 */
export function remindersFrom({ appointments = [], plan, supply }: Inputs, now = new Date()): Reminder[] {
  const out: Reminder[] = [];

  for (const a of appointments) {
    const at = a.scheduledFor ? Date.parse(a.scheduledFor) : NaN;
    if (a.status === 'SCHEDULED' && at > now.getTime() && at - now.getTime() < 2 * DAY) {
      const days = calendarDaysBetween(a.scheduledFor!, now);
      out.push({ key: `appt-${a.id}`, icon: '📅', title: 'Appointment coming up', detail: `${days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : fmtDate(a.scheduledFor!)} at ${fmtTime(a.scheduledFor!)}`, href: '/appointments' });
    }
  }

  const next = plan?.nextDoseAt ? Date.parse(plan.nextDoseAt) : NaN;
  if (next < now.getTime() + DAY) {
    out.push({ key: 'dose', icon: '💉', title: next < now.getTime() - DAY ? 'An injection is overdue' : 'Injection due today', detail: [plan?.productName, plan?.strength].filter(Boolean).join(' '), href: '/doses' });
  }

  if (supply?.refillState === 'READY') out.push({ key: 'refill', icon: '📦', title: 'Time to order your next supply', detail: 'Your doctor approves it first', href: '/orders' });

  const until = plan?.validUntil ? Date.parse(plan.validUntil) : NaN;
  if (until > now.getTime() && until - now.getTime() < 14 * DAY) {
    out.push({ key: 'rx-exp', icon: '📄', title: 'Your prescription runs out soon', detail: `On ${fmtDate(plan!.validUntil!)}. Your doctor renews it at your check-in`, href: '/dashboard' });
  }
  return out;
}
