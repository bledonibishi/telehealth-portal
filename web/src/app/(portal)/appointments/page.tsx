'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { CANCEL_MY_APPOINTMENT, MY_APPOINTMENTS, REQUEST_APPOINTMENT } from '@/graphql/portal';
import { CONTACT, EMERGENCY_NUMBER, telHref } from '@/lib/contact';
import { Card, CardHeader, btnPrimary, btnSoft } from '@/components/portal/Card';
import { PageHeader } from '@/components/portal/PageHeader';
import { Icon, type IconName } from '@/components/portal/Icon';
import { BookingCard } from '@/components/booking/BookingCard';
import { BookedAppointments } from '@/components/booking/BookedAppointments';
import { PastAppointments } from '@/components/booking/PastAppointments';
import { InlineError } from '@/components/common/Alert';

const REASONS: Array<{ value: string; label: string; icon: IconName; hint: string }> = [
  { value: 'QUESTION', label: 'A question', icon: 'help', hint: 'About your treatment, dose or diet' },
  { value: 'CHECK_UP', label: 'Check-up', icon: 'heart', hint: 'A routine review with your doctor' },
  { value: 'SIDE_EFFECT', label: 'Side effect', icon: 'alert', hint: 'Something you’re feeling since starting' },
  { value: 'PAIN', label: 'Pain', icon: 'alert', hint: 'Pain anywhere, mild or bad' },
  { value: 'DOSE_CHANGE', label: 'Dose change', icon: 'syringe', hint: 'You’d like to talk about your dose' },
  { value: 'OTHER', label: 'Something else', icon: 'chat', hint: 'Anything not listed' },
];
const REASON_LABEL = Object.fromEntries(REASONS.map((r) => [r.value, r.label]));

// Same keys as RED_FLAGS in backend/src/appointments/triage.ts.
const RED_FLAGS: Array<[string, string]> = [
  ['chest_pain', 'Chest pain or tightness'],
  ['breathing', 'Trouble breathing'],
  ['fainting', 'Fainting or confusion'],
  ['severe_abdominal_pain', 'Severe stomach pain that spreads to the back'],
  ['cannot_keep_fluids', 'Can’t keep any fluids down'],
  ['allergic_reaction', 'Swelling of the face, lips or throat'],
  ['leg_swelling', 'A painful, swollen leg'],
  ['stroke_signs', 'Face drooping, arm weakness or slurred speech'],
];

const STATUS: Record<string, { label: string; cls: string }> = {
  REQUESTED: { label: 'Waiting for a doctor', cls: 'bg-amber-50 text-amber-700' },
  SCHEDULED: { label: 'Booked', cls: 'bg-emerald-50 text-emerald-700' },
  COMPLETED: { label: 'Done', cls: 'bg-slate-100 text-slate-600' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500' },
};

function EmergencyNotice({ text }: { text: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 flex gap-3">
      <Icon name="alert" className="w-6 h-6 text-red-600 flex-shrink-0" />
      <div>
        <p className="text-sm font-semibold text-red-800">{text}</p>
        <a href={telHref(EMERGENCY_NUMBER)} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2"><Icon name="phone" className="w-4 h-4" /> Call {EMERGENCY_NUMBER}</a>
      </div>
    </div>
  );
}

/**
 * Asking to see a doctor: one tap on what it's about, plus only the questions that change how fast it is
 * handled (pain, warning signs, "it can't wait"). The server decides how fast it must be answered (24 hours when urgent, 3 days otherwise) and sends
 * warning signs to emergency services first.
 */
function RequestForm({ startUrgent, onDone }: { startUrgent: boolean; onDone: (advice: string | null, created: { id: string; bookingPurpose?: string | null } | null) => void }) {
  const [reason, setReason] = useState(startUrgent ? 'SIDE_EFFECT' : '');
  const [pain, setPain] = useState(0);
  const [urgent, setUrgent] = useState(startUrgent);
  const [flags, setFlags] = useState<string[]>([]);
  const [send, { loading, error }] = useMutation(REQUEST_APPOINTMENT, { refetchQueries: [{ query: MY_APPOINTMENTS }] });
  const askPain = reason === 'PAIN' || reason === 'SIDE_EFFECT';
  const willBeUrgent = urgent || flags.length > 0 || (askPain && pain >= 7);

  const toggle = (k: string) => setFlags((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;
    try {
      const { data } = await send({ variables: { input: { reason, urgent, painLevel: askPain ? pain : undefined, redFlags: flags } } });
      onDone(data?.requestAppointment?.advice ?? null, data?.requestAppointment ?? null);
    } catch { /* shown from `error` */ }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset>
        <legend className="text-sm font-semibold text-ink-900 mb-2">What is it about?</legend>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {REASONS.map((r) => (
            <label key={r.value} className={`rounded-xl border p-3 cursor-pointer ${reason === r.value ? 'border-ink-600 bg-ink-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="sr-only" />
              <span className="flex items-center gap-2 text-sm font-medium text-ink-900"><Icon name={r.icon} className="w-4 h-4 text-ink-700" />{r.label}</span>
              <span className="block text-[11px] text-slate-500 mt-0.5">{r.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {askPain && (
        <div>
          <label htmlFor="pain" className="block text-sm font-semibold text-ink-900">How bad is it? <span className="font-normal text-slate-500">{pain}/10</span></label>
          <input id="pain" type="range" min={0} max={10} value={pain} onChange={(e) => setPain(Number(e.target.value))} className="w-full accent-ink-700 mt-2" />
          <div className="flex justify-between text-[11px] text-slate-400"><span>No pain</span><span>Worst imaginable</span></div>
        </div>
      )}

      <fieldset className="rounded-2xl border border-red-100 bg-red-50/50 p-4">
        <legend className="text-sm font-semibold text-red-800 px-1">Do you have any of these right now?</legend>
        <div className="grid sm:grid-cols-2 gap-2 mt-1">
          {RED_FLAGS.map(([k, l]) => (
            <label key={k} className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={flags.includes(k)} onChange={() => toggle(k)} className="mt-0.5 accent-red-600" /> {l}
            </label>
          ))}
        </div>
        {flags.length > 0 && <p className="text-sm font-semibold text-red-700 mt-3">Please call {EMERGENCY_NUMBER} or go to the nearest emergency department now. You can still send this so your doctor knows.</p>}
      </fieldset>

      <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 cursor-pointer">
        <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="mt-0.5 accent-ink-700" />
        <span>
          <span className="block text-sm font-medium text-ink-900">It can’t wait</span>
          <span className="block text-xs text-slate-500">Urgent requests are answered by a doctor within 24 hours.</span>
        </span>
      </label>

      <div className={`rounded-xl p-3 text-sm ${willBeUrgent ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-600'}`}>
        <b>{willBeUrgent ? 'Urgent' : 'Routine'}:</b> {willBeUrgent ? 'a doctor will get back to you within 24 hours.' : 'a doctor will get back to you within 3 days. Questions can also go straight to Messages.'}
      </div>

      <InlineError error={error} />
      <button type="submit" disabled={loading || !reason} className={btnPrimary}>{loading ? 'Sending…' : 'Continue to pick a time'}</button>
    </form>
  );
}

export default function AppointmentsPage() {
  const { data, loading, refetch } = useQuery(MY_APPOINTMENTS, { fetchPolicy: 'cache-and-network' });
  const [cancel, { loading: cancelling }] = useMutation(CANCEL_MY_APPOINTMENT);
  // The request whose scheduler is open: a new request opens its own straight away, so asking and booking are one visit.
  const [picking, setPicking] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [startUrgent, setStartUrgent] = useState(false);
  const [sent, setSent] = useState<{ advice: string | null } | null>(null);
  const list: any[] = data?.myAppointments ?? [];

  // Links like "Book appointment" arrive with ?new=1 (and &urgent=1 from the emergency card).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('new')) setFormOpen(true);
    if (q.get('urgent')) setStartUrgent(true);
  }, []);

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-8 max-w-5xl">
      <PageHeader title="Appointments" subtitle="See a doctor about a check-up, a side effect or anything worrying you.">
        {!formOpen && <button type="button" onClick={() => { setFormOpen(true); setSent(null); }} className={btnPrimary}><Icon name="plus" className="w-4 h-4" /> Book appointment</button>}
      </PageHeader>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_18rem] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {sent && (sent.advice ? <EmergencyNotice text={sent.advice} /> : (
            <div role="status" className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-sm text-emerald-800"><b>Request sent.</b> {picking ? 'Pick a time that suits you below.' : 'Your doctor will reply with a time — you’ll get an email, and it will show below.'}</div>
          ))}

          <BookedAppointments onChange={() => refetch()} />

          {formOpen && (
            <Card>
              <CardHeader title="Request an appointment">
                <button type="button" onClick={() => setFormOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-600"><Icon name="close" /></button>
              </CardHeader>
              <RequestForm key={String(startUrgent)} startUrgent={startUrgent} onDone={(advice, created) => { setSent({ advice }); setFormOpen(false); if (!advice && created?.bookingPurpose) setPicking(created.id); }} />
            </Card>
          )}

          <Card>
            <CardHeader title="Your requests" subtitle="What you’ve asked to see a doctor about." />
            {loading && !list.length && <p className="text-sm text-slate-400">Loading…</p>}
            {!loading && !list.length && <p className="text-sm text-slate-500">No appointments yet.</p>}
            <ul className="divide-y divide-slate-100">
              {list.map((a) => (
                <li key={a.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-900">
                        {REASON_LABEL[a.reason] ?? a.reason}
                        {a.urgency === 'URGENT' && <span className="ml-2 text-[11px] font-semibold rounded-full bg-red-50 text-red-700 px-2 py-0.5">Urgent</span>}
                      </p>
                      {a.details && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{a.details}</p>}
                    </div>
                    <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${STATUS[a.status]?.cls}`}>{STATUS[a.status]?.label}</span>
                  </div>
                  {a.bookingPurpose && picking === a.id ? (
                    <div className="mt-3">
                      <BookingCard purpose={a.bookingPurpose} referenceId={a.id} onChange={(current) => { refetch(); if (current) setPicking(null); }} />
                    </div>
                  ) : a.bookingPurpose && a.status === 'REQUESTED' ? (
                    <button type="button" onClick={() => setPicking(a.id)} className={`${btnSoft} !py-1.5 !text-xs mt-3`}>
                      <Icon name="calendar" className="w-4 h-4" /> Pick a time
                    </button>
                  ) : null}
                  {a.status === 'SCHEDULED' && a.scheduledFor && picking !== a.id && (
                    <div className="mt-3 rounded-xl bg-ink-50 p-3 text-sm">
                      <p className="font-semibold text-ink-900">{format(new Date(a.scheduledFor), 'EEEE d MMMM · HH:mm')}{a.clinicianName ? ` with ${a.clinicianName}` : ''}</p>
                      {a.meetingUrl && <a href={a.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-ink-600 font-medium mt-1">Join video call <Icon name="arrow" className="w-4 h-4" /></a>}
                    </div>
                  )}
                  {a.emergencyAdvised && a.status === 'REQUESTED' && <p className="text-xs font-medium text-red-700 mt-2">You ticked a warning sign — if you haven’t yet, call {EMERGENCY_NUMBER} now.</p>}
                  {a.clinicianNote && <p className="text-xs text-slate-600 mt-2"><b>Your doctor:</b> {a.clinicianNote}</p>}
                  <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-400">
                    <span>Sent {format(new Date(a.createdAt), 'd MMM, HH:mm')}</span>
                    {a.status === 'REQUESTED' && <span>Reply expected {Date.parse(a.respondBy) > Date.now() ? `within ${formatDistanceToNowStrict(new Date(a.respondBy))}` : 'very soon'}</span>}
                    {(a.status === 'REQUESTED' || a.status === 'SCHEDULED') && (
                      <button type="button" disabled={cancelling} onClick={() => cancel({ variables: { id: a.id } }).catch(() => undefined)} className="text-slate-500 hover:text-red-600 underline">Cancel</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <PastAppointments />
        </div>

        <div className="space-y-5">
          <section className="rounded-2xl border border-red-200 bg-red-50/70 p-5">
            <p className="text-sm font-semibold text-red-700 flex items-center gap-2"><Icon name="alert" className="w-4 h-4" /> Emergency?</p>
            <p className="text-xs text-red-700/80 mt-1">Chest pain, trouble breathing, severe stomach pain or fainting: don’t book — call now.</p>
            <a href={telHref(EMERGENCY_NUMBER)} className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2.5"><Icon name="phone" className="w-4 h-4" /> Call {EMERGENCY_NUMBER}</a>
            {CONTACT.urgentPhone && <a href={telHref(CONTACT.urgentPhone)} className="block text-center text-xs font-medium text-red-700 mt-2">Clinic urgent line: {CONTACT.urgentPhone}</a>}
          </section>
          <Card>
            <p className="text-sm font-semibold text-ink-900">How fast we reply</p>
            <ul className="text-xs text-slate-600 mt-2 space-y-1.5">
              <li><b className="text-red-700">Urgent</b> — within 24 hours</li>
              <li><b className="text-ink-900">Routine</b> — within 3 days</li>
              <li><b className="text-ink-900">Quick questions</b> — usually fastest in Messages</li>
            </ul>
            <a href="/messages" className={`${btnSoft} w-full mt-4`}><Icon name="chat" className="w-4 h-4" /> Open Messages</a>
          </Card>
        </div>
      </div>
    </div>
  );
}
