'use client';

import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { differenceInCalendarDays, format } from 'date-fns';
import { MY_TREATMENT_PLAN } from '@/graphql/portal';
import { MY_DOSE_SUMMARY } from '@/graphql/dosing';
import { MY_CHECK_IN_STATUS } from '@/graphql/checkin';
import { Icon, type IconName } from '@/components/portal/Icon';
import { doseWords } from '@/lib/dose-words';

type Tone = 'brand' | 'amber' | 'lav' | 'leaf';
const TONE: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-600',
  amber: 'bg-amber-50 text-amber-700',
  lav: 'bg-lav-50 text-lav-700',
  leaf: 'bg-leaf-50 text-leaf-700',
};

function Row({ icon, tone, label, title, detail, action }: { icon: IconName; tone: Tone; label: string; title: string; detail?: string | null; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 min-w-0">
      <span className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${TONE[tone]}`}><Icon name={icon} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="font-display text-lg font-semibold text-ink-900 leading-tight truncate">{title}</p>
        {detail && <p className="text-sm text-slate-500 line-clamp-2">{detail}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

const pill = 'inline-flex items-center gap-1.5 rounded-full text-sm font-semibold px-4 py-2 transition-colors whitespace-nowrap';

/** "Today", "Tomorrow", "Fri 16 Oct". */
const dayLabel = (d: Date) => {
  const n = differenceInCalendarDays(d, new Date());
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : format(d, 'EEE d MMM');
};

/**
 * The first thing on the home screen: what to do today. The next dose (logged from the dose calendar, where an injection
 * site is picked too) and the monthly check-in, which is what lets the next supply go out.
 */
export function TodayCard() {
  const { data: planData } = useQuery(MY_TREATMENT_PLAN, { fetchPolicy: 'cache-first' });
  const { data: doseData } = useQuery(MY_DOSE_SUMMARY, { fetchPolicy: 'cache-and-network' });
  const { data: ciData } = useQuery(MY_CHECK_IN_STATUS, { fetchPolicy: 'cache-and-network' });
  const plan = planData?.myTreatmentPlan;
  const dose = doseData?.myDoseSummary;
  const ci = ciData?.myCheckInStatus;
  const words = doseWords(plan?.form);

  const nextAt = dose?.nextDoseAt ? new Date(dose.nextDoseAt) : null;
  const daysToDose = nextAt ? differenceInCalendarDays(nextAt, new Date()) : null;
  const doseNow = daysToDose != null && daysToDose <= 0;
  const doseHref = dose?.nextDoseId ? `/doses?dose=${dose.nextDoseId}` : '/doses';

  const doseRow = nextAt ? (
    <Row
      icon={words.icon}
      tone={daysToDose! < 0 ? 'amber' : 'brand'}
      label={words.next}
      title={daysToDose! < 0 ? `Overdue since ${format(nextAt, 'EEE d MMM')}` : dayLabel(nextAt)}
      detail={dose?.current ?? (plan ? `${plan.productName}${plan.strength ? ` ${plan.strength}` : ''}` : null)}
      action={
        doseNow ? (
          <Link href={doseHref} className={`${pill} bg-brand-600 hover:bg-brand-700 text-white`}><Icon name="check" className="w-4 h-4" /> Log it</Link>
        ) : (
          <Link href="/doses" className={`${pill} text-brand-600 hover:bg-brand-50`}>Calendar <Icon name="arrow" className="w-4 h-4" /></Link>
        )
      }
    />
  ) : null;

  let checkInRow: React.ReactNode = null;
  if (ci?.state === 'READY') {
    checkInRow = (
      <Row icon="note" tone="lav" label="Monthly check-in" title="Ready for you now" detail="A few questions so your doctor can approve your next supply"
        action={ci.url ? <a href={ci.url} className={`${pill} bg-lav-700 hover:bg-lav-500 text-white`}>Start <Icon name="arrow" className="w-4 h-4" /></a> : null} />
    );
  } else if (ci?.state === 'COMPLETED') {
    checkInRow = (
      <Row icon="check" tone="leaf" label="Monthly check-in" title="Done, thank you"
        detail={ci.lastCompletedAt ? `Sent ${format(new Date(ci.lastCompletedAt), 'd MMM')} · your doctor reviews it` : 'Your doctor reviews it'} />
    );
  } else if (ci?.nextDueAt) {
    checkInRow = (
      <Row icon="calendar" tone="lav" label="Next monthly check-in" title={dayLabel(new Date(ci.nextDueAt))} detail="We’ll email you when it opens" />
    );
  }

  if (!doseRow && !checkInRow) return null;
  return (
    <section aria-label="Today" className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/80 shadow-[0_1px_2px_rgba(10,56,54,0.04)] mb-5">
      <div className="h-1 bg-ring" aria-hidden />
      <div className={`grid gap-5 p-5 ${doseRow && checkInRow ? 'md:grid-cols-2 md:divide-x md:divide-slate-100 [&>*:nth-child(2)]:md:pl-5' : ''}`}>
        {doseRow}
        {checkInRow}
      </div>
    </section>
  );
}
