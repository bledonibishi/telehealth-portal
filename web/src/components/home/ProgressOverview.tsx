'use client';

import Link from 'next/link';
import { format, isToday, isTomorrow } from 'date-fns';
import { useMyBookings } from '@telehealth/booking';
import { useUnreadMessages } from '@/lib/useUnreadMessages';
import { useRefill } from '@/lib/useRefill';
import { kg } from '@/lib/weight';
import { Icon, type IconName } from '@/components/portal/Icon';
import type { Plan } from './PlanHero';

function Tile({ href, icon, label, value, hint, tone = 'ink' }: { href: string; icon: IconName; label: string; value: string; hint?: string; tone?: 'ink' | 'green' | 'amber' }) {
  const tones = { ink: 'bg-ink-50 text-ink-700', green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700' };
  return (
    <Link href={href} className="bg-white rounded-2xl border border-slate-200/70 p-4 flex items-start gap-3 hover:border-ink-600/40 transition-colors min-w-0">
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tones[tone]}`}><Icon name={icon} /></span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-slate-500">{label}</span>
        <span className="block text-base font-bold text-ink-900 truncate">{value}</span>
        {hint && <span className="block text-xs text-slate-500 line-clamp-2">{hint}</span>}
      </span>
    </Link>
  );
}

const dayOf = (d: Date) => (isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : format(d, 'EEE d MMM'));

/**
 * "Your treatment progress" in one row: how far to the goal, the next injection, doses left, the next
 * appointment, unread messages and the next order. Each tile opens the page behind it. A tile only shows
 * when there is something real to put in it.
 */
export function ProgressOverview({ journey, plan }: { journey?: any; plan?: Plan | null }) {
  const { bookings } = useMyBookings();
  const { unread } = useUnreadMessages();
  const { status: supply, requested } = useRefill();
  const next = bookings[0];
  const left = plan?.supplyDosesTotal != null ? Math.max(plan.supplyDosesTotal - (plan.supplyDosesTaken ?? 0), 0) : null;
  const days: number | null = supply?.daysUntilNextSupply ?? null;

  return (
    <section aria-label="Your treatment progress" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 min-[1800px]:grid-cols-6 gap-3 mb-5 [&>*]:min-w-0">
      {journey?.progressPercentage != null && (
        <Tile href="/weight-journey" icon="flag" tone="green" label="Progress to goal" value={`${Math.round(journey.progressPercentage)}%`}
          hint={journey.targetWeightKg ? `${kg(journey.remainingKg)} to go · goal ${kg(journey.targetWeightKg)}` : undefined} />
      )}
      {plan && (
        <Tile href="/doses" icon="syringe" label="Next injection" value={plan.nextDoseAt ? dayOf(new Date(plan.nextDoseAt)) : 'Not scheduled'}
          hint={plan.nextDoseAt ? `${plan.productName}${plan.strength ? ` ${plan.strength}` : ''}` : undefined} />
      )}
      {left != null && (
        <Tile href="/treatment-plan" icon="plan" tone={left <= 1 ? 'amber' : 'ink'} label="Doses left" value={`${left} of ${plan!.supplyDosesTotal}`} hint={left <= 1 ? 'Time to order your next supply' : 'In your current supply'} />
      )}
      <Tile href="/appointments" icon="calendar" label="Next appointment" value={next ? `${dayOf(new Date(next.startsAt))} · ${format(new Date(next.startsAt), 'HH:mm')}` : 'None booked'}
        hint={next ? (next.hostName ? `With ${next.hostName}` : undefined) : 'Book one any time'} />
      <Tile href="/messages" icon="chat" tone={unread ? 'amber' : 'ink'} label="Messages" value={unread ? `${unread} unread` : 'All read'} hint="From your care team" />
      {days != null && (
        <Tile href="/orders" icon="truck" label="Next order" value={requested ? 'Requested' : days > 1 ? `In ${days} days` : days === 1 ? 'Tomorrow' : 'Due now'}
          hint={requested ? 'Waiting for your doctor' : 'Approved by your doctor first'} />
      )}
    </section>
  );
}
