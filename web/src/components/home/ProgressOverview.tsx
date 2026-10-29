'use client';

import Link from 'next/link';
import { format, isToday, isTomorrow } from 'date-fns';
import { useMyBookings } from '@telehealth/booking';
import { useUnreadMessages } from '@/lib/useUnreadMessages';
import { useRefill } from '@/lib/useRefill';
import { kg } from '@/lib/weight';
import { useElementWidth } from '@/lib/useElementWidth';
import { Icon, type IconName } from '@/components/portal/Icon';
import type { Plan } from './PlanHero';
import { doseWords } from '@/lib/dose-words';

function Tile({ href, icon, label, value, hint, tone = 'ink', small = false }: { href: string; icon: IconName; label: string; value: string; hint?: string; tone?: 'ink' | 'green' | 'amber'; small?: boolean }) {
  const tones = { ink: 'bg-ink-50 text-ink-700', green: 'bg-leaf-50 text-leaf-700', amber: 'bg-amber-50 text-amber-700' };
  return (
    <Link href={href} className={`bg-white rounded-2xl border border-slate-200/80 flex items-start hover:border-brand-500/40 hover:shadow-sm transition min-w-0 ${small ? 'p-3 gap-2.5 flex-col' : 'p-4 gap-3'}`}>
      <span className={`rounded-full flex items-center justify-center flex-shrink-0 ${small ? 'w-8 h-8' : 'w-10 h-10'} ${tones[tone]}`}><Icon name={icon} className={small ? 'w-4 h-4' : 'w-5 h-5'} /></span>
      <span className="min-w-0 w-full">
        <span className="block text-xs font-medium text-slate-500 truncate">{label}</span>
        <span className="block font-display text-base font-semibold text-ink-900 truncate">{value}</span>
        {hint && !small && <span className="block text-xs text-slate-500 line-clamp-2">{hint}</span>}
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
  // As many tiles per row as the card's own width has room for.
  const [ref, width] = useElementWidth<HTMLElement>();
  // Two a row even on a phone: the tiles are short, and a column of them pushed everything else off the screen.
  const fits = width == null ? 3 : width < 760 ? 2 : width < 1100 ? 3 : 5;
  const small = width != null && width < 520;
  const { bookings } = useMyBookings();
  const { unread } = useUnreadMessages();
  const { status: supply, requested } = useRefill();
  const next = bookings[0];
  const left = plan?.supplyDosesTotal != null ? Math.max(plan.supplyDosesTotal - (plan.supplyDosesTaken ?? 0), 0) : null;
  const days: number | null = supply?.daysUntilNextSupply ?? null;
  // As many columns as there are tiles, up to what fits, so a short row has no empty slots at its end.
  const count = (journey?.progressPercentage != null ? 1 : 0) + (left != null ? 1 : 0) + 2 + (days != null ? 1 : 0);
  const columns = Math.max(1, Math.min(fits, count));

  return (
    <section ref={ref} aria-label="Your treatment progress" className="grid gap-3 [&>*]:min-w-0" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {journey?.progressPercentage != null && (
        <Tile small={small} href="/weight-journey" icon="flag" tone="green" label="Progress to goal" value={`${Math.round(journey.progressPercentage)}%`}
          hint={journey.targetWeightKg ? `${kg(journey.remainingKg)} to go · goal ${kg(journey.targetWeightKg)}` : undefined} />
      )}
      {left != null && (
        <Tile small={small} href="/treatment-plan" icon="plan" tone={left <= 1 ? 'amber' : 'ink'} label="Doses left" value={`${left} of ${plan!.supplyDosesTotal}`} hint={left <= 1 ? 'Time to order your next supply' : 'In your current supply'} />
      )}
      <Tile small={small} href="/appointments" icon="calendar" label="Next appointment" value={next ? `${dayOf(new Date(next.startsAt))} · ${format(new Date(next.startsAt), 'HH:mm')}` : 'None booked'}
        hint={next ? (next.hostName ? `With ${next.hostName}` : undefined) : 'Book one any time'} />
      <Tile small={small} href="/messages" icon="chat" tone={unread ? 'amber' : 'ink'} label="Messages" value={unread ? `${unread} unread` : 'All read'} hint="From your care team" />
      {days != null && (
        <Tile small={small} href="/orders" icon="truck" label="Next order" value={requested ? 'Requested' : days > 1 ? `In ${days} days` : days === 1 ? 'Tomorrow' : 'Due now'}
          hint={requested ? 'Waiting for your doctor' : 'Approved by your doctor first'} />
      )}
    </section>
  );
}
