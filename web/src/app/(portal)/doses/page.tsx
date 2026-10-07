'use client';

import { PageHeader } from '@/components/portal/PageHeader';
import { EmptyState } from '@/components/portal/EmptyState';
import { MY_PRODUCT_KIND } from '@/graphql/intake';
import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@apollo/client';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin, { type DateClickArg } from '@fullcalendar/interaction';
import type { EventClickArg, EventContentArg, EventInput } from '@fullcalendar/core';
import { differenceInCalendarDays, differenceInHours, format, isPast, isToday } from 'date-fns';
import { MARK_DOSE_SKIPPED, MARK_DOSE_TAKEN, MY_DOSE_CALENDAR, MY_MISSED_DOSE_STATUS, UNMARK_DOSE } from '@/graphql/dosing';
import { MY_CONSULTATIONS } from '@/graphql/consultations';
import { InjectionSitePicker } from '@/components/doses/InjectionSitePicker';
import { InjectionGuide } from '@/components/doses/InjectionGuide';
import { InjectionVideoDialog } from '@/components/doses/InjectionVideoDialog';
import { AfterDoseCheck, doseToAskAbout } from '@/components/doses/AfterDoseCheck';
import { DoseHistory } from '@/components/doses/DoseHistory';
import { WeeklySideEffectPrompt } from '@/components/doses/SideEffectTracker';
import { lastSiteOf, SITE_LABEL, suggestNextSite, type InjectionSite } from '@/lib/injection-sites';
import '@/styles/dose-calendar.css';

type DoseEvent = {
  id: string;
  scheduledFor: string;
  status: 'SCHEDULED' | 'TAKEN' | 'MISSED' | 'SKIPPED';
  takenAt?: string | null;
  note?: string | null;
  injectionSite?: InjectionSite | null;
  feelingAfter?: string | null;
  feelingAfterAt?: string | null;
  product: { id: string; name: string; brandName?: string | null; form: string; category: string; requiresColdChain: boolean };
  strength: { id: string; label: string; titrationStep?: number | null };
};

// Chosen so every status reads as a distinct hue at a glance, not just a
// distinct shade — teal-vs-green (brand's own color next to "taken") turned
// out to be nearly indistinguishable in the grid, so scheduled uses blue and
// the brand teal is reserved for UI chrome instead of a status color.
const COLORS: Record<string, { bg: string; solid: string; text: string }> = {
  SCHEDULED: { bg: '#eff6ff', solid: '#3b82f6', text: '#1d4ed8' },
  DUE: { bg: '#fffbeb', solid: '#f59e0b', text: '#92400e' },
  TAKEN: { bg: '#f0fdf4', solid: '#16a34a', text: '#166534' },
  MISSED: { bg: '#fff1f2', solid: '#f43f5e', text: '#9f1239' },
  SKIPPED: { bg: '#f8fafc', solid: '#94a3b8', text: '#475569' },
};
const LEGEND: (keyof typeof COLORS)[] = ['SCHEDULED', 'DUE', 'TAKEN', 'MISSED', 'SKIPPED'];

const doseName = (d: DoseEvent) => `${d.product.brandName ?? d.product.name} ${d.strength.label}`;
const statusLabel = (s: string) => (s === 'DUE' ? 'Due' : s.charAt(0) + s.slice(1).toLowerCase());
// "0.75 mg per pump" -> "0.75 mg", "50 micrograms/24 h" -> "50 mcg" — the grid cell has no room for more.
const shortStrength = (label: string) => (label.match(/^[\d.]+\s*[a-zA-Zµ%]+/)?.[0] ?? label).replace(/micrograms?$/, 'mcg');

// How long after the scheduled day a missed weekly dose can still be taken, per the
// product's licence (semaglutide: within 5 days; otherwise skip to the next one).
// Products not listed get "ask your clinician" rather than a guess.
const LATE_DOSE_WINDOW_DAYS: Record<string, number> = { Semaglutide: 5 };
function missedDoseAdvice(d: DoseEvent, needsClinician: boolean): string | null {
  if (d.product.category !== 'GLP1') return null;
  const daysLate = differenceInCalendarDays(new Date(), new Date(d.scheduledFor));
  if (daysLate < 1) return null;
  // After several missed in a row, restarting at this dose is the clinician's call.
  if (needsClinician) return 'You’ve missed several doses in a row — please message your clinician before taking this or your next dose.';
  const window = LATE_DOSE_WINDOW_DAYS[d.product.name];
  if (window === undefined) return 'Missed this dose? Message your clinician for advice before taking it late.';
  return daysLate <= window
    ? `Missed it? You can still take it today — it’s within ${window} days of the scheduled day. Then carry on with your usual day.`
    : `It’s more than ${window} days since this dose was due, so skip it and take your next one on your usual day. Never take two doses to catch up.`;
}

// Where the injection-site picker and the how-to guide apply: pens for the weight-loss medicines.
const isRotatingPen = (d: DoseEvent) => d.product.category === 'GLP1' && d.product.form === 'INJECTION_PEN';
/** Pens and vials: "how are you feeling after your injection?" makes no sense for a patch or a gel. */
const isInjected = (d: DoseEvent) => d.product.form === 'INJECTION_PEN' || d.product.form === 'INJECTION_VIAL';

/** "today" / "tomorrow" / "in 7 days" / "2 days ago", counted in calendar days. */
function countdown(date: Date): string {
  const n = differenceInCalendarDays(date, new Date());
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/** "today at 09:00" / "Tue 6 Oct at 09:00" — the actual time, not "about 1 hour ago". */
function takenAtText(date: Date): string {
  return `${isToday(date) ? 'today' : format(date, 'EEE d MMM')} at ${format(date, 'HH:mm')}`;
}

/** A dose two or more days past due and still not logged, when no later one has been dealt with. */
const OVERDUE_ALERT_HOURS = 48;
function overdueDose(doses: DoseEvent[], now = new Date()): DoseEvent | null {
  const latestPast = doses.filter((d) => new Date(d.scheduledFor) <= now).sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor))[0];
  if (!latestPast || (latestPast.status !== 'SCHEDULED' && latestPast.status !== 'MISSED')) return null;
  return differenceInHours(now, new Date(latestPast.scheduledFor)) >= OVERDUE_ALERT_HOURS ? latestPast : null;
}

function visualStatus(d: DoseEvent): keyof typeof COLORS {
  if (d.status === 'SCHEDULED' && isPast(new Date(d.scheduledFor)) && !isToday(new Date(d.scheduledFor))) return 'DUE';
  return d.status;
}

// Compact colored chip for the month grid — the default FullCalendar event
// box truncates mid-word and has nowhere near enough room for a full drug
// name, so the grid only shows the strength; the full name lives in the
// tooltip and the detail panel once clicked. List view keeps FullCalendar's
// own row rendering, which is already clean — but it colors itself from the
// event's backgroundColor/borderColor, so those still have to be set below
// rather than only living in extendedProps.
function DoseChip(arg: EventContentArg) {
  if (arg.view.type === 'listMonth') return true;
  return (
    <div className="dose-event-chip" style={{ background: arg.event.backgroundColor, color: arg.event.textColor }} title={arg.event.extendedProps.fullName}>
      <span className="dose-event-dot" style={{ background: arg.event.borderColor }} />
      <span className="dose-event-label">{arg.event.title}</span>
    </div>
  );
}

function DetailPanel({ dose, needsClinician, lastSite, onClose }: { dose: DoseEvent; needsClinician: boolean; lastSite: InjectionSite | null; onClose: () => void }) {
  const [note, setNote] = useState('');
  const suggestedSite = suggestNextSite(lastSite);
  const [site, setSite] = useState<InjectionSite | null>(null);
  const [guide, setGuide] = useState(false);
  const [video, setVideo] = useState(false);
  const [error, setError] = useState('');
  // Same variables as the page's own query, or the refetch lands under another cache key and the dose on screen goes stale.
  const opts = { refetchQueries: [{ query: MY_DOSE_CALENDAR, variables: { fromDays: 60, toDays: 90 } }, { query: MY_MISSED_DOSE_STATUS }], onCompleted: onClose, onError: (e: Error) => setError(e.message) };
  const [markTaken, { loading: taking }] = useMutation(MARK_DOSE_TAKEN, opts);
  const [markSkipped, { loading: skipping }] = useMutation(MARK_DOSE_SKIPPED, opts);
  const [unmark, { loading: undoing }] = useMutation(UNMARK_DOSE, opts);
  const status = visualStatus(dose);
  const c = COLORS[status];
  const isPatch = dose.product.form === 'PATCH';
  const advice = missedDoseAdvice(dose, needsClinician);
  const pen = isRotatingPen(dose);
  // Offered while logging, and afterwards if it was left out.
  // Logging an injection is for the day it is due (or after): a dose on a later day can only be looked at.
  const notYet = dose.status === 'SCHEDULED' && differenceInCalendarDays(new Date(dose.scheduledFor), new Date()) > 0;
  const askSite = pen && !notYet && (dose.status === 'SCHEDULED' || dose.status === 'MISSED' || (dose.status === 'TAKEN' && !dose.injectionSite));

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">{doseName(dose)}</p>
          <p className="text-xs text-slate-400 mt-0.5">{format(new Date(dose.scheduledFor), 'EEEE, d MMMM yyyy')}</p>
        </div>
        <button onClick={onClose} className="text-slate-300 hover:text-slate-500 text-sm">✕</button>
      </div>

      <span className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: c.bg, color: c.text }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.solid }} />
        {status === 'DUE' ? 'Due — not yet logged' : statusLabel(status)}
      </span>

      {dose.takenAt && <p className="text-sm font-medium text-emerald-700 mt-3">✅ Taken {takenAtText(new Date(dose.takenAt))}</p>}
      {dose.injectionSite && <p className="text-xs text-slate-500 mt-1">Injected: {SITE_LABEL[dose.injectionSite].toLowerCase()}</p>}
      {dose.note && <p className="text-xs text-slate-500 mt-2">Note: {dose.note}</p>}
      {dose.product.requiresColdChain && <p className="text-xs text-slate-400 mt-2">Keep refrigerated (2–8°C).</p>}
      {isPatch && <p className="text-xs text-slate-400 mt-2">Put the new patch on a different spot from the last one, below the waist.</p>}
      {(dose.status === 'MISSED' || status === 'DUE') && advice && <p className="text-xs text-slate-600 bg-amber-50 rounded-lg px-3 py-2 mt-3">{advice}</p>}
      {pen && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <button type="button" onClick={() => setVideo(true)} className="text-xs font-semibold text-brand-600 hover:text-brand-700">▶ Watch how to inject</button>
          <button type="button" onClick={() => setGuide(true)} className="text-xs font-semibold text-brand-600 hover:text-brand-700">Step-by-step guide →</button>
        </div>
      )}
      {askSite && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold text-slate-700 mb-2">Where are you injecting?</p>
          <InjectionSitePicker value={site} suggested={suggestedSite} last={lastSite} onChange={setSite} />
          {dose.status === 'TAKEN' && (
            <button type="button" disabled={!site || taking} onClick={() => markTaken({ variables: { id: dose.id, injectionSite: site } })}
              className="mt-3 text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50">Save where I injected</button>
          )}
        </div>
      )}
      {error && <p className="text-xs text-danger-500 mt-2">{error}</p>}
      {guide && <InjectionGuide onClose={() => setGuide(false)} requiresColdChain={dose.product.requiresColdChain} />}
      {video && <InjectionVideoDialog onClose={() => setVideo(false)} onShowSteps={() => { setVideo(false); setGuide(true); }} />}

      {notYet && (
        <p className="text-sm text-slate-600 bg-slate-50 rounded-xl px-3 py-2.5 mt-4" role="status">
          This {isPatch ? 'patch change' : 'injection'} is due {countdown(new Date(dose.scheduledFor))}, on {format(new Date(dose.scheduledFor), 'EEEE d MMMM')}. You can log it that day.
        </p>
      )}

      {(dose.status === 'SCHEDULED' || dose.status === 'MISSED') && (
        <div className="mt-4 space-y-2">
          {!notYet && <button
            onClick={() => markTaken({ variables: { id: dose.id, injectionSite: pen ? site : undefined } })}
            disabled={taking}
            className="w-full bg-ink-700 hover:bg-ink-800 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl"
          >
            {taking ? 'Saving…' : isPatch ? 'Mark patch changed' : 'Mark as taken'}
          </button>}
          <div className="flex gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason (optional)"
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ink-500"
            />
            <button
              onClick={() => markSkipped({ variables: { id: dose.id, note: note.trim() || undefined } })}
              disabled={skipping}
              className="flex-shrink-0 text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl px-3 whitespace-nowrap disabled:opacity-50"
            >
              {skipping ? '…' : 'Skip'}
            </button>
          </div>
        </div>
      )}

      {(dose.status === 'TAKEN' || dose.status === 'SKIPPED') && (
        <button onClick={() => unmark({ variables: { id: dose.id } })} disabled={undoing} className="mt-4 text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50">
          {undoing ? 'Undoing…' : 'Undo'}
        </button>
      )}
    </div>
  );
}

export default function DosesPage() {
  const { data, loading, error } = useQuery(MY_DOSE_CALENDAR, { variables: { fromDays: 60, toDays: 90 } });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const doses: DoseEvent[] = data?.myDoseCalendar ?? [];
  const selected = doses.find((d) => d.id === selectedId) ?? null;
  const overdue = overdueDose(doses);

  const next = useMemo(
    () => doses.filter((d) => d.status === 'SCHEDULED').sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))[0],
    [doses],
  );

  // Worked out by the backend on the active prescription only, so misses on a replaced one don't count.
  const { data: kindData } = useQuery(MY_PRODUCT_KIND, { fetchPolicy: 'cache-first' });
  const { data: missedData } = useQuery(MY_MISSED_DOSE_STATUS, { fetchPolicy: 'cache-and-network' });
  const missed = missedData?.myMissedDoseStatus ?? { missedInARow: 0, needsClinician: false };
  const needsClinician: boolean = missed.needsClinician;
  // Straight into the conversation (on the newest consultation, where replies go) rather than the
  // Messages list; skipped until the banner is actually shown.
  const { data: consultationsData } = useQuery(MY_CONSULTATIONS, { skip: !needsClinician && !overdue });
  const latestConsultationId: string | undefined = consultationsData?.myConsultations?.[0]?.id;
  const messageClinicianHref = latestConsultationId ? `/consultation/${latestConsultationId}?chat=open` : '/messages';

  const events: EventInput[] = doses.map((d) => {
    const c = COLORS[visualStatus(d)];
    return {
      id: d.id,
      title: shortStrength(d.strength.label),
      start: d.scheduledFor,
      allDay: true,
      backgroundColor: c.bg,
      borderColor: c.solid,
      textColor: c.text,
      extendedProps: { fullName: doseName(d) },
    };
  });

  const calendarRef = useRef<FullCalendar>(null);
  const doseDates = useMemo(() => new Set(doses.map((d) => format(new Date(d.scheduledFor), 'yyyy-MM-dd'))), [doses]);

  const askedAbout = doseToAskAbout(doses.filter(isInjected));
  const lastSite = lastSiteOf(doses);

  const handleEventClick = (arg: EventClickArg) => setSelectedId(arg.event.id);

  const handleDateClick = (arg: DateClickArg) => {
    const api = calendarRef.current?.getApi();
    const match = api?.getEvents().find((e) => e.startStr === arg.dateStr);
    if (match) setSelectedId(match.id);
  };

  // The hormone programmes use gels, patches and capsules; only GLP-1 and testosterone are injected.
  const injections = kindData?.myProductKind !== 'HRT';

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-8 max-w-5xl">
      <PageHeader title={injections ? 'Injections' : 'My doses'} subtitle={injections ? 'When each injection is due, and what you’ve taken.' : 'When each dose is due, and what you’ve taken.'} />

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {error && <p className="text-sm text-danger-500">{error.message}</p>}

      {!loading && doses.length === 0 && (
        <EmptyState
          icon="syringe"
          what={injections ? 'Your injection schedule' : 'Your dose schedule'}
          whenTreating={{ text: 'Your medicine has no fixed dose days, so there is nothing to tick off here. Take it as your prescription says.', action: { href: '/treatment-plan', label: 'See how to take it' } }}
        />
      )}

      {doses.length > 0 && (
        <>
          {needsClinician && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6" role="alert">
              <p className="text-sm font-semibold text-amber-900">You’ve missed {missed.missedInARow} doses in a row</p>
              <p className="text-sm text-amber-900/80 mt-1">
                Please message your clinician before your next injection. After a break, going straight back to your current dose can cause
                strong side effects, so they may restart you on a lower one.
              </p>
              <Link href={messageClinicianHref} className="inline-block mt-3 text-sm font-semibold text-ink-800 hover:text-ink-900">Message my clinician →</Link>
            </div>
          )}
          {!needsClinician && overdue && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6" role="alert">
              <p className="text-sm font-semibold text-amber-900">Your injection from {format(new Date(overdue.scheduledFor), 'EEEE d MMMM')} hasn’t been logged</p>
              <p className="text-sm text-amber-900/80 mt-1">{missedDoseAdvice(overdue, false) ?? 'If you haven’t taken it, message your care team before taking it late.'}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
                <button type="button" onClick={() => setSelectedId(overdue.id)} className="text-sm font-semibold text-ink-800 hover:text-ink-900">I’ve taken it — log it</button>
                <Link href={messageClinicianHref} className="text-sm font-semibold text-ink-800 hover:text-ink-900">Message my care team →</Link>
              </div>
            </div>
          )}
          <WeeklySideEffectPrompt />
          {askedAbout && <AfterDoseCheck dose={{ id: askedAbout.id, takenAt: askedAbout.takenAt! }} doseName={doseName(askedAbout)} />}
          {next && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5 mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-ink-800 uppercase tracking-wide">Next {injections ? 'injection' : 'dose'}</p>
                <p className="text-lg font-semibold text-slate-900 mt-1">{doseName(next)}</p>
                <p className="text-sm text-slate-500 mt-0.5">
                  {format(new Date(next.scheduledFor), 'EEEE, d MMMM')} · <b className="text-slate-700">{countdown(new Date(next.scheduledFor))}</b>
                  {isRotatingPen(next) && <> · try the <b className="text-slate-700">{SITE_LABEL[suggestNextSite(lastSite)].toLowerCase()}</b></>}
                </p>
              </div>
              <button
                onClick={() => setSelectedId(next.id)}
                className="flex-shrink-0 bg-ink-700 hover:bg-ink-800 text-white text-sm font-semibold px-4 py-2.5 rounded-xl"
              >
                Open
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4 text-xs text-slate-500">
            {LEGEND.map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: COLORS[s].solid }} />
                {statusLabel(s)}
              </span>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-4 dose-calendar">
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' }}
                buttonText={{ today: 'Today', month: 'Month', list: 'List' }}
                height="auto"
                events={events}
                eventContent={DoseChip}
                eventClick={handleEventClick}
                dateClick={handleDateClick}
                dayCellClassNames={(arg) => (doseDates.has(format(arg.date, 'yyyy-MM-dd')) ? ['dose-calendar-day-clickable'] : [])}
                dayMaxEvents={3}
              />
            </div>

            <div>
              {selected ? (
                <DetailPanel key={selected.id} dose={selected} needsClinician={needsClinician} lastSite={lastSite} onClose={() => setSelectedId(null)} />
              ) : (
                <div className="bg-white rounded-2xl border border-slate-100 p-5 text-sm text-slate-400">
                  Click a dose on the calendar to log it or see the details.
                </div>
              )}
            </div>
          </div>

          <DoseHistory doses={doses} showSite={doses.some(isRotatingPen)} />
        </>
      )}
    </div>
  );
}
