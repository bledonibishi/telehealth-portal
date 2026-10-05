'use client';

import { useQuery } from '@apollo/client';
import { format } from 'date-fns';
import { MY_CONSULTATIONS } from '@/graphql/consultations';
import { MY_ORDERS } from '@/graphql/orders';
import { Card, CardHeader } from '@/components/portal/Card';
import { Icon } from '@/components/portal/Icon';
import type { Plan } from './PlanHero';

type Step = { key: string; title: string; detail?: string; state: 'done' | 'now' | 'next' };

const on = (d?: string | Date | null) => (d ? format(new Date(d), 'd MMM yyyy') : undefined);

/**
 * Where the patient is in their treatment, start to renewal, built from what has actually happened:
 * assessment → doctor review → prescription → first delivery → injections → review → renewal.
 */
export function TreatmentTimeline({ plan, journey }: { plan?: Plan | null; journey?: any }) {
  const { data: cData } = useQuery(MY_CONSULTATIONS, { fetchPolicy: 'cache-first' });
  const { data: oData } = useQuery(MY_ORDERS, { fetchPolicy: 'cache-first' });
  const consultations: any[] = cData?.myConsultations ?? [];
  const first = consultations.length ? consultations.reduce((a, b) => (Date.parse(b.submittedAt) < Date.parse(a.submittedAt) ? b : a)) : null;
  const reviewed = consultations.some((c) => c.status === 'APPROVED') || !!plan;
  const delivered = ((oData?.myOrders ?? []) as any[]).filter((o) => o.deliveredAt).sort((a, b) => Date.parse(a.deliveredAt) - Date.parse(b.deliveredAt))[0];
  const started = !!delivered || (plan?.dosesTaken ?? 0) > 0;
  const total = plan?.dosesPlanned ?? null;
  const allTaken = total != null && (plan?.dosesTaken ?? 0) >= total;

  const facts: Array<Omit<Step, 'state'> & { done: boolean }> = [
    { key: 'assessment', title: 'Assessment', detail: first ? `Questionnaire sent ${on(first.submittedAt)}` : 'Your medical questionnaire', done: !!first },
    { key: 'review', title: 'Doctor review', detail: reviewed ? 'Reviewed by a doctor' : first ? 'A doctor is reviewing your answers' : undefined, done: reviewed },
    { key: 'rx', title: 'Prescription approved', detail: plan ? `${plan.productName}${plan.strength ? ` ${plan.strength}` : ''} · ${on(plan.startedAt)}` : undefined, done: !!plan },
    { key: 'start', title: 'Treatment started', detail: delivered ? `First supply delivered ${on(delivered.deliveredAt)}` : started ? 'First injection logged' : 'When your first supply arrives', done: started },
    { key: 'doses', title: 'Injections', detail: plan ? (total ? `${plan.dosesTaken} of ${total} taken` : `${plan.dosesTaken} taken so far`) : undefined, done: allTaken },
    { key: 'checkin', title: 'Review with your doctor', detail: journey?.checkInState === 'READY' ? 'Your monthly check-in is ready' : journey?.nextCheckInDueAt ? `Next check-in ${on(journey.nextCheckInDueAt)}` : 'A monthly check-in before each new supply', done: false },
    { key: 'renewal', title: 'Renewal', detail: plan?.validUntil ? `Prescription runs until ${on(plan.validUntil)}` : 'Your doctor renews your prescription when it runs out', done: false },
  ];
  // The first thing not yet done is where the patient is now.
  const current = facts.findIndex((f) => !f.done);
  const steps: Step[] = facts.map((f, i) => ({ key: f.key, title: f.title, detail: f.detail, state: f.done ? 'done' : i === current ? 'now' : 'next' }));

  return (
    <Card labelledBy="timeline-title">
      <CardHeader id="timeline-title" title="Your treatment timeline" subtitle="Where you are, from your first assessment to renewal." />
      <ol className="relative">
        {steps.map((s, i) => (
          <li key={s.key} className="flex gap-3 pb-5 last:pb-0 relative" aria-current={s.state === 'now' ? 'step' : undefined}>
            {i < steps.length - 1 && <span className={`absolute left-[11px] top-6 bottom-0 w-0.5 ${s.state === 'done' ? 'bg-emerald-500' : 'bg-slate-200'}`} aria-hidden />}
            <span className={`relative w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${s.state === 'done' ? 'bg-emerald-500 text-white' : s.state === 'now' ? 'bg-ink-700 text-white ring-4 ring-ink-100' : 'bg-white border-2 border-slate-300'}`}>
              {s.state === 'done' ? <Icon name="check" className="w-3.5 h-3.5" /> : s.state === 'now' ? <span className="w-2 h-2 rounded-full bg-white" /> : null}
            </span>
            <div className="min-w-0 -mt-0.5">
              <p className={`text-sm ${s.state === 'next' ? 'text-slate-500' : 'font-semibold text-ink-900'}`}>
                {s.title}{s.state === 'now' && <span className="ml-2 text-[11px] font-semibold rounded-full bg-ink-50 text-ink-700 px-2 py-0.5">You are here</span>}
              </p>
              {s.detail && <p className="text-xs text-slate-500">{s.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
