'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { differenceInDays } from 'date-fns';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { GET_WEIGHT_CHART } from '@/graphql/weight';
import { PATIENT_ADHERENCE, PATIENT_RECENT_DOSES } from '@/graphql/patients';
import { FEELINGS, kg, kgChange } from '@/lib/weight';
import { medicationStyle } from '@/lib/medication';
import { STALE_WEIGH_IN_DAYS, TREATMENT_STATUS, type TreatmentStatus } from '@/lib/patient-status';
import MedicationPill from './MedicationPill';
import ProgressRing from './ProgressRing';

export type SnapshotTab = 'messages' | 'prescriptions' | 'labs' | 'weight';

const CARD = 'bg-white border border-gray-200 rounded-2xl';
const HEADING = 'text-xs font-semibold text-gray-500 uppercase tracking-wide';

/** What the patient is on right now, read off their active prescription. */
export function currentMedications(prescriptions: any[]): { label: string; dose?: string }[] {
  const rx = prescriptions.find((r) => r.status === 'ACTIVE');
  if (!rx) return [];
  if (rx.items?.length) return rx.items.map((i: any) => ({ label: i.product.brandName ?? i.product.name, dose: i.strength.label }));
  return [{ label: rx.medication, dose: rx.dosage }];
}

export function treatmentStatusOf(patient: any, prescriptions: any[]): TreatmentStatus {
  if (!patient.activatedAt) return 'PENDING';
  if (prescriptions.some((r) => r.status === 'ACTIVE')) return 'ACTIVE';
  const consultations: { status: string }[] = patient.consultations ?? [];
  return consultations.length > 0 && consultations.every((c) => c.status === 'DECLINED') ? 'DECLINED' : 'INACTIVE';
}

export function heightMetres(consultations: any[]): number | null {
  for (const c of consultations ?? []) {
    const a = c.quizAnswers?.find((x: any) => x.questionId === 'height_cm');
    const cm = Number(a?.answer);
    if (Number.isFinite(cm) && cm > 0) return cm / 100;
  }
  return null;
}

// ── Weight chart ────────────────────────────────────────────────────────────

const YEAR_MS = 365 * 86_400_000;

/** The pixel width of an element, kept current as the layout changes — lets the chart draw at its real size. */
function useWidth<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width] as const;
}

/** Every weighing in the last 12 months, plus the starting weight and target — drawn by the chart and mined for journey milestones. */
export function useWeightTimeline(patientId: string, skip: boolean) {
  const [range] = useState(() => ({ from: new Date(Date.now() - YEAR_MS).toISOString(), to: new Date(Date.now() + 3_600_000).toISOString() }));
  const { data, loading } = useQuery(GET_WEIGHT_CHART, { variables: { patientId, ...range, limit: 500 }, fetchPolicy: 'cache-and-network', skip });
  return { timeline: data?.weightTimelineForPatient as any, loading, from: range.from };
}

export function WeightChart({ timeline, loading, from, height = 240 }: {
  timeline: any; loading: boolean; from: string; height?: number;
}) {
  const gradientId = useId();
  const { t, fmt } = useI18n();
  const [boxRef, width] = useWidth<HTMLDivElement>();

  const points = useMemo(() => {
    if (!timeline) return [];
    const rows: { at: number; kg: number; label: string }[] = [];
    if (timeline.startingWeightKg !== null && timeline.startingAt && new Date(timeline.startingAt).getTime() >= new Date(from).getTime()) {
      rows.push({ at: new Date(timeline.startingAt).getTime(), kg: timeline.startingWeightKg, label: t('Starting weight') });
    }
    for (const m of timeline.measurements) {
      rows.push({ at: new Date(m.measuredAt).getTime(), kg: m.weightKg, label: m.kind === 'CHECK_IN' ? t('Check-in') : t('Daily entry') });
    }
    return rows.sort((a, b) => a.at - b.at);
  }, [timeline, from, t]);

  if (loading && !timeline) return <p className="text-sm text-gray-400 py-10 text-center">{t('Loading…')}</p>;
  if (points.length === 0) return <p className="text-sm text-gray-400 py-10 text-center">{t('No weights recorded yet.')}</p>;
  if (width === 0) return <div ref={boxRef} className="w-full" style={{ height }} />;

  const target: number | null = timeline.targetWeightKg ?? null;
  const W = Math.max(width, 200), H = height, L = 36, R = 12, T = 12, B = 24;
  const values = points.map((p) => p.kg).concat(target !== null ? [target] : []);
  const step = Math.max(1, Math.ceil((Math.max(...values) - Math.min(...values) + 2) / 3));
  const lo = Math.floor(Math.min(...values) - 1);
  const hi = lo + 3 * step;
  const t0 = points[0].at;
  const t1 = Math.max(points[points.length - 1].at, t0 + 86_400_000);
  const x = (t: number) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points[points.length - 1].at).toFixed(1)},${H - B} L${x(points[0].at).toFixed(1)},${H - B} Z`;
  const yTicks = [lo, lo + step, lo + 2 * step, hi];
  const xTicks = [t0, t0 + (t1 - t0) / 2, t1];

  return (
    <div ref={boxRef} className="w-full">
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={t('Weight over time')}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--chart-accent)' }} stopOpacity="0.3" />
          <stop offset="100%" style={{ stopColor: 'var(--chart-accent)' }} stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-[color:var(--border)]" />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" className="fill-[color:var(--t-dim)]" fontSize="11">{v}</text>
        </g>
      ))}
      {xTicks.map((tick, i) => (
        <text key={i} x={x(tick)} y={H - 8} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'} className="fill-[color:var(--t-dim)]" fontSize="11">
          {fmt(tick, 'd MMM yyyy')}
        </text>
      ))}
      {target !== null && (
        <g>
          <line x1={L} x2={W - R} y1={y(target)} y2={y(target)} style={{ stroke: 'var(--chart-target)' }} strokeDasharray="5 4" />
          <text x={L + 4} y={y(target) - 5} textAnchor="start" style={{ fill: 'var(--chart-target)' }} fontSize="11" fontWeight="600">{t('Target {weight}', { weight: kg(target) })}</text>
        </g>
      )}
      {points.length > 1 && <path d={area} fill={`url(#${gradientId})`} />}
      {points.length > 1 && <path d={line} fill="none" style={{ stroke: 'var(--chart-accent)' }} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
      {points.map((p, i) => (
        <circle key={i} cx={x(p.at)} cy={y(p.kg)} r={points.length > 40 ? 2 : 3.5} style={{ fill: 'var(--bg-card)', stroke: 'var(--chart-accent)' }} strokeWidth="2">
          <title>{`${kg(p.kg)} · ${fmt(p.at, 'd MMM yyyy')} · ${p.label}`}</title>
        </circle>
      ))}
    </svg>
    </div>
  );
}

// ── Treatment journey ───────────────────────────────────────────────────────

export type JourneyEvent = { at: Date; title: string; detail?: string; med?: string; future?: boolean; milestone?: boolean };

export function buildEvents(patient: any, prescriptions: any[], journey: any, timeline: any, t: (text: string, vars?: Record<string, string | number>) => string): JourneyEvent[] {
  const events: JourneyEvent[] = [{ at: new Date(patient.createdAt), title: t('Joined') }];

  const rxs = [...prescriptions].sort((a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime());
  let previousDose: string | null = null;
  for (const rx of rxs) {
    const meds = currentMedications([{ ...rx, status: 'ACTIVE' }]);
    const label = meds.map((m) => m.label).join(' + ');
    const dose = meds.map((m) => m.dose).filter(Boolean).join(' + ');
    events.push({
      at: new Date(rx.issuedAt),
      title: previousDose === null ? t('Treatment started') : dose === previousDose ? t('Prescription renewed') : t('Dose changed'),
      detail: [label, dose].filter(Boolean).join(' · '),
      med: meds[0]?.label,
    });
    previousDose = dose;
  }

  const byCheckIn = new Map<string, any>((journey?.entries ?? []).map((e: any) => [e.checkInId, e]));
  for (const c of patient.checkIns ?? []) {
    if (c.status !== 'COMPLETED' || !c.completedAt) continue;
    const entry = byCheckIn.get(c.id);
    events.push({
      at: new Date(c.completedAt),
      title: entry ? t('Check-in · month {n}', { n: entry.month }) : t('Check-in completed'),
      detail: entry ? `${kg(entry.weightKg)} (${entry.changeKg === 0 ? t('no change') : kgChange(entry.changeKg)})` : undefined,
    });
  }

  // The first weighing at or past each 5 kg lost, and the day the target was reached.
  const start: number | null = timeline?.startingWeightKg ?? journey?.startingWeightKg ?? null;
  if (start !== null) {
    let milestone = 5;
    let reachedTarget = false;
    for (const m of timeline?.measurements ?? []) {
      while (start - m.weightKg >= milestone) {
        events.push({ at: new Date(m.measuredAt), title: t('Lost {n} kg', { n: milestone }), detail: t('Weighed {weight}', { weight: kg(m.weightKg) }), milestone: true });
        milestone += 5;
      }
      if (!reachedTarget && timeline.targetWeightKg !== null && m.weightKg <= timeline.targetWeightKg) {
        reachedTarget = true;
        events.push({ at: new Date(m.measuredAt), title: t('Target reached'), detail: kg(m.weightKg), milestone: true });
      }
    }
  }

  const next = journey?.nextCheckInDueAt ?? (patient.checkIns ?? []).find((c: any) => c.status === 'SCHEDULED')?.dueAt;
  if (next && new Date(next) > new Date()) events.push({ at: new Date(next), title: t('Next check-in'), future: true });

  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function TreatmentJourney({ events }: { events: JourneyEvent[] }) {
  const { fmt } = useI18n();
  return (
    <div className="overflow-x-auto pb-2 -mx-1 px-1">
      <ol className="flex min-w-max">
        {events.map((e, i) => {
          const dot = e.future ? 'bg-white border-2 border-dashed border-gray-300' : e.milestone ? 'bg-green-500' : e.med ? medicationStyle(e.med).dot : 'bg-brand-500';
          return (
            <li key={i} className="relative w-40 pr-3 pt-6">
              <span className={`absolute top-[7px] h-0.5 left-0 ${i === events.length - 1 ? 'w-4' : 'right-0'} ${e.future ? 'border-t-2 border-dashed border-gray-200' : 'bg-gray-200'}`} />
              <span className={`absolute top-0 left-0 w-4 h-4 rounded-full ring-4 ring-white ${dot}`} />
              <p className="text-[11px] text-gray-400">{fmt(e.at, 'd MMM yyyy')}</p>
              <p className={`text-sm font-medium mt-0.5 ${e.future ? 'text-gray-400' : 'text-gray-900'}`}>{e.title}</p>
              {e.detail && <p className="text-xs text-gray-500 mt-0.5">{e.detail}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── Dose adherence ──────────────────────────────────────────────────────────

// Left and right are the patient's own. Same keys as InjectionSite in the backend.
const SITE_LABEL: Record<string, string> = {
  ABDOMEN_LEFT: 'Belly, left', ABDOMEN_RIGHT: 'Belly, right', THIGH_LEFT: 'Thigh, left', THIGH_RIGHT: 'Thigh, right', ARM_LEFT: 'Upper arm, left', ARM_RIGHT: 'Upper arm, right',
};

/** The last few injections taken: where they went in and how the patient said they felt a day or so after. */
function RecentInjections({ patientId }: { patientId: string }) {
  const { t, fmt } = useI18n();
  const { data } = useQuery(PATIENT_RECENT_DOSES, { variables: { patientId } });
  const taken: any[] = (data?.patientDoseCalendar ?? [])
    .filter((d: any) => d.status === 'TAKEN' && d.takenAt)
    .sort((a: any, b: any) => b.takenAt.localeCompare(a.takenAt))
    .slice(0, 5);
  if (taken.length === 0) return null;
  return (
    <div className="mt-4 pt-3 border-t border-gray-100">
      <p className={HEADING}>{t('Recent injections')}</p>
      <ul className="mt-2 space-y-1.5">
        {taken.map((d) => {
          const feeling = d.feelingAfter ? FEELINGS[d.feelingAfter] : undefined;
          const rough = d.feelingAfter === 'DIFFICULTIES' || d.feelingAfter === 'NOT_WELL';
          return (
            <li key={d.id} className="flex flex-wrap items-baseline gap-x-3 text-xs">
              <span className="text-gray-500 w-14">{fmt(d.takenAt, 'd MMM')}</span>
              <span className="text-gray-700">{d.strength.label}</span>
              <span className="text-gray-400">{d.injectionSite ? t(SITE_LABEL[d.injectionSite]) : '—'}</span>
              <span className={`ml-auto ${rough ? 'font-medium text-rose-600' : 'text-gray-500'}`}>
                {feeling ? `${feeling.emoji} ${t(feeling.label)}` : t('No answer yet')}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Adherence({ patientId }: { patientId: string }) {
  const { t, fmt } = useI18n();
  const { data, loading } = useQuery(PATIENT_ADHERENCE, { variables: { patientId, weeks: 8 } });
  const weeks: any[] = data?.doseAdherenceTrend ?? [];
  const taken = weeks.reduce((n, w) => n + w.taken, 0);
  const due = weeks.reduce((n, w) => n + w.taken + w.missed + w.skipped, 0);
  const pct = due ? Math.round((taken / due) * 100) : null;

  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-baseline justify-between">
        <p className={HEADING}>{t('Dose adherence · last 8 weeks')}</p>
        {pct !== null && <p className="text-sm font-semibold text-gray-900">{pct}%</p>}
      </div>
      {loading && !data ? (
        <p className="text-sm text-gray-400 mt-4">{t('Loading…')}</p>
      ) : weeks.length === 0 ? (
        <p className="text-sm text-gray-400 mt-4">{t('No doses logged yet.')}</p>
      ) : (
        <>
          <div className="flex items-end gap-1.5 h-20 mt-4">
            {weeks.map((w) => (
              <div
                key={w.weekStart}
                className="flex-1 max-w-14 bg-gray-100 rounded-md h-full flex items-end overflow-hidden"
                title={t('Week of {date}: {taken} taken, {missed} missed, {skipped} skipped', { date: fmt(w.weekStart, 'd MMM'), taken: w.taken, missed: w.missed, skipped: w.skipped })}
              >
                <div
                  className={`w-full ${w.adherencePct >= 80 ? 'bg-green-400' : w.adherencePct >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`}
                  style={{ height: `${Math.max(w.adherencePct, 4)}%` }}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">{t('{taken} of {due} scheduled doses taken', { taken, due })}</p>
        </>
      )}
      <RecentInjections patientId={patientId} />
    </div>
  );
}

// ── Snapshot ────────────────────────────────────────────────────────────────

function Stat({ label, value, tone = 'text-gray-900' }: { label: string; value: string; tone?: string }) {
  const { t } = useI18n();
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2.5">
      <p className="text-xs text-gray-400">{t(label)}</p>
      <p className={`text-sm font-semibold mt-0.5 ${tone}`}>{value}</p>
    </div>
  );
}

export default function PatientSnapshot({
  patient, journey, prescriptions, messages, canSeeAdherence, canReviewLabs, onOpenTab,
}: {
  patient: any;
  journey: any | null;
  prescriptions: any[];
  messages: any[];
  canSeeAdherence: boolean;
  canReviewLabs: boolean;
  onOpenTab: (tab: SnapshotTab) => void;
}) {
  const { t, fmt, timeAgo } = useI18n();
  const status = TREATMENT_STATUS[treatmentStatusOf(patient, prescriptions)];
  const meds = currentMedications(prescriptions);
  const { timeline, loading: timelineLoading, from } = useWeightTimeline(patient.id, !journey);
  const events = useMemo(() => buildEvents(patient, prescriptions, journey, timeline, t), [patient, prescriptions, journey, timeline, t]);

  const hasGoal = journey && journey.progressPercentage !== null && journey.progressPercentage !== undefined;
  const lost: number | null = hasGoal ? journey.weightLostKg : null;
  const height = heightMetres(patient.consultations);
  const bmi = journey?.currentWeightKg && height ? journey.currentWeightKg / (height * height) : null;

  const lastEntry = journey?.entries?.[journey.entries.length - 1];
  const awaitingReply = messages.length > 0 && messages[messages.length - 1].senderRole === 'PATIENT';
  const latestConsult = patient.consultations?.[0];
  const { data: adherenceData } = useQuery(PATIENT_ADHERENCE, { variables: { patientId: patient.id, weeks: 2 }, skip: !canSeeAdherence });
  const missedRecently = (adherenceData?.doseAdherenceTrend ?? []).reduce((n: number, w: any) => n + w.missed, 0);

  // Things a clinician would want to know before opening anything else.
  const attention: { text: string; cls: string }[] = [];
  for (const rf of latestConsult?.redFlags ?? []) {
    attention.push({ text: rf.description, cls: rf.severity === 'CRITICAL' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700' });
  }
  if (awaitingReply) attention.push({ text: t('Patient is waiting for a reply'), cls: 'bg-rose-50 text-rose-700' });
  if (lastEntry?.feeling === 'NOT_WELL' || lastEntry?.feeling === 'DIFFICULTIES') {
    attention.push({ text: t('Last check-in: {feeling}', { feeling: t(FEELINGS[lastEntry.feeling].label).toLowerCase() }), cls: 'bg-amber-50 text-amber-700' });
  }
  if (missedRecently > 0) attention.push({ text: missedRecently > 1 ? t('{n} missed doses in the last 2 weeks', { n: missedRecently }) : t('1 missed dose in the last 2 weeks'), cls: 'bg-amber-50 text-amber-700' });
  if (status === TREATMENT_STATUS.ACTIVE && journey?.latestMeasurementAt && differenceInDays(new Date(), new Date(journey.latestMeasurementAt)) > STALE_WEIGH_IN_DAYS) {
    attention.push({ text: t('No weigh-in for {n} days', { n: differenceInDays(new Date(), new Date(journey.latestMeasurementAt)) }), cls: 'bg-amber-50 text-amber-700' });
  }

  const startedAt = prescriptions.length
    ? new Date(Math.min(...prescriptions.map((r) => new Date(r.issuedAt).getTime())))
    : null;
  const recent = messages.slice(-3);

  return (
    <div className="space-y-5">
      {attention.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attention.map((a, i) => (
            <span key={i} className={`text-xs font-medium px-2.5 py-1 rounded-full ${a.cls}`}>{a.text}</span>
          ))}
        </div>
      )}

      {/* Treatment + progress */}
      <div className={`${CARD} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={HEADING}>{t('Current treatment')}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {meds.length > 0
                ? meds.map((m, i) => <MedicationPill key={i} label={m.label} dose={m.dose} size="md" />)
                : <span className="text-sm text-gray-400">{t('Not on a prescription')}</span>}
            </div>
            <div className="flex items-center gap-3 mt-3">
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${status.cls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                {t(status.label)}
              </span>
              {startedAt && <span className="text-xs text-gray-400">{t('On treatment since {date}', { date: fmt(startedAt, 'd MMM yyyy') })}</span>}
            </div>
          </div>

          {journey && (
            <div className="flex items-center gap-4">
              <ProgressRing value={hasGoal ? journey.progressPercentage : null} size={96} stroke={9} showLabel />
              <div>
                <p className={HEADING}>{t('Target progress')}</p>
                <p className="text-sm text-gray-700 mt-1 max-w-[12rem]">
                  {hasGoal
                    ? journey.remainingKg > 0 ? t('{weight} to go', { weight: kg(journey.remainingKg) }) : t('Target reached')
                    : t('No target weight set yet')}
                </p>
              </div>
            </div>
          )}
        </div>

        {journey && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-5">
            <Stat label="Starting" value={kg(journey.startingWeightKg)} />
            <Stat label="Current" value={kg(journey.currentWeightKg)} />
            <Stat
              label="Lost"
              value={lost === null ? '—' : `${lost > 0 ? '−' : lost < 0 ? '+' : ''}${kg(Math.abs(lost))}`}
              tone={lost === null ? undefined : lost > 0 ? 'text-green-600' : lost < 0 ? 'text-rose-500' : undefined}
            />
            <Stat label="Target" value={kg(journey.targetWeightKg)} />
            <Stat label="Remaining" value={hasGoal ? kg(journey.remainingKg) : '—'} />
            <Stat label="BMI" value={bmi ? bmi.toFixed(1) : '—'} />
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-5">
          <button onClick={() => onOpenTab('messages')} className="px-3.5 py-2 text-sm font-medium rounded-lg bg-brand-500 text-white hover:bg-brand-900 transition-colors">
            {t('Message patient')}
          </button>
          <button onClick={() => onOpenTab('prescriptions')} className="px-3.5 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">
            {t('Adjust dosage')}
          </button>
          {canReviewLabs && (
            <button onClick={() => onOpenTab('labs')} className="px-3.5 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">
              {t('Review labs')}
            </button>
          )}
          {journey && (
            <button onClick={() => onOpenTab('weight')} className="px-3.5 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">
              {t('All weigh-ins')}
            </button>
          )}
        </div>
      </div>

      {/* Weight over time */}
      {journey && (
        <div className={`${CARD} p-5`}>
          <div className="flex items-baseline justify-between mb-2">
            <p className={HEADING}>{t('Weight over time')}</p>
            {journey.latestMeasurementAt && (
              <p className="text-xs text-gray-400">{t('Last weighed {when}', { when: timeAgo(journey.latestMeasurementAt) })}</p>
            )}
          </div>
          <WeightChart timeline={timeline} loading={timelineLoading} from={from} />
        </div>
      )}

      {/* Journey */}
      <div className={`${CARD} p-5`}>
        <p className={`${HEADING} mb-4`}>{t('Treatment journey')}</p>
        <TreatmentJourney events={events} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {canSeeAdherence && <Adherence patientId={patient.id} />}

        <div className={`${CARD} p-4 ${canSeeAdherence ? '' : 'lg:col-span-2'}`}>
          <div className="flex items-center justify-between">
            <p className={HEADING}>{t('Messages')}</p>
            <button onClick={() => onOpenTab('messages')} className="text-xs text-brand-500 hover:text-brand-900">{t('Open thread')}</button>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-gray-400 mt-4">{t('No messages yet.')}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {recent.map((m) => {
                const fromPatient = m.senderRole === 'PATIENT';
                return (
                  <li key={m.id} className="flex gap-2.5">
                    <span className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-semibold ${fromPatient ? 'bg-gray-200 text-gray-600' : 'bg-brand-50 text-brand-900'}`}>
                      {fromPatient ? `${patient.firstName[0]}${patient.lastName[0]}` : 'Dr'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400">
                        {fromPatient ? patient.firstName : t('Clinician team')} · {timeAgo(m.sentAt)}
                      </p>
                      <p className="text-sm text-gray-800 line-clamp-2">{m.content}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
