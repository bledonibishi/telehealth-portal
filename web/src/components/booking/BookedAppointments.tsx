'use client';

import { useState } from 'react';
import { format, isToday, isTomorrow } from 'date-fns';
import { BookingScheduler, useMyBookings, useReschedule, type Booking } from '@telehealth/booking';
import { Card, CardHeader, btnOutline } from '@/components/portal/Card';
import { Icon } from '@/components/portal/Icon';
import { InlineError } from '@/components/common/Alert';
import { errorMessage } from '@telehealth/shared-types';

const BRAND = '#132f6f';

const dayOf = (d: Date) => (isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : format(d, 'EEEE d MMMM'));

/**
 * The patient's real appointments — read from the scheduling provider, not only from our own record — each
 * with a way to join, move or cancel it. Hidden while there are none, so the page reads the same as before
 * for someone who hasn't booked.
 */
export function BookedAppointments({ onChange }: { onChange?: () => void }) {
  const b = useMyBookings({ onChange });
  const move = useReschedule();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ uid: string; text: string } | null>(null);

  if (!b.bookings.length) return b.settling ? <Card><p role="status" className="text-sm text-slate-500">Updating your appointments…</p></Card> : null;

  const cancel = async (c: Booking) => {
    setProblem(null);
    try {
      await b.cancel(c.uid, 'Cancelled by the patient');
      setConfirming(null);
    } catch (err: any) {
      setProblem({ uid: c.uid, text: errorMessage(err) || 'Couldn’t cancel that. Please try again.' });
    }
  };

  return (
    <Card labelledBy="booked-title">
      <CardHeader id="booked-title" title="Your booked appointments" subtitle="Join, move or cancel a time you have booked.">
        {b.settling && <span role="status" className="text-xs text-slate-400">Updating…</span>}
      </CardHeader>
      <ul className="space-y-3">
        {b.bookings.map((c) => {
          const start = new Date(c.startsAt);
          const moving = move.uid === c.uid;
          return (
            <li key={c.uid} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="w-12 h-12 rounded-xl bg-ink-50 text-ink-800 flex flex-col items-center justify-center flex-shrink-0 leading-none">
                    <span className="text-[10px] font-semibold uppercase">{format(start, 'MMM')}</span>
                    <span className="text-lg font-bold">{format(start, 'd')}</span>
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-900">{dayOf(start)} · {format(start, 'HH:mm')}–{format(new Date(c.endsAt), 'HH:mm')}</p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{c.title ?? 'Appointment'}</p>
                    {c.hostName && <p className="text-xs text-slate-500">With {c.hostName}</p>}
                    {c.location && <p className="text-xs text-slate-500">{c.location}</p>}
                  </div>
                </div>
                <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${c.status === 'PENDING' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {c.status === 'PENDING' ? 'Waiting for confirmation' : 'Confirmed'}
                </span>
              </div>

              {confirming === c.uid ? (
                <div className="mt-3 rounded-xl bg-red-50 border border-red-100 p-3 flex flex-wrap items-center gap-3">
                  <p className="text-sm text-red-800 flex-1 min-w-[12rem]">Cancel this appointment? The time will be given up.</p>
                  <button type="button" onClick={() => cancel(c)} disabled={b.cancelling === c.uid} className="rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5">
                    {b.cancelling === c.uid ? 'Cancelling…' : 'Yes, cancel it'}
                  </button>
                  <button type="button" onClick={() => setConfirming(null)} className="text-xs font-medium text-slate-600">Keep it</button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  {c.meetingUrl && <a href={c.meetingUrl} target="_blank" rel="noreferrer" className={`${btnOutline} !py-1.5 !text-xs`}>Join video call <Icon name="arrow" className="w-3.5 h-3.5" /></a>}
                  {c.canReschedule && !moving && <button type="button" onClick={() => move.start(c.uid)} className="text-xs font-medium text-ink-600 hover:text-ink-800">Change time</button>}
                  <button type="button" onClick={() => { setConfirming(c.uid); move.stop(); }} className="text-xs font-medium text-slate-500 hover:text-red-600">Cancel appointment</button>
                </div>
              )}
              {problem?.uid === c.uid && <InlineError error={problem.text} size="xs" className="mt-2" />}

              {moving && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-ink-900">Choose a new time</p>
                    <button type="button" onClick={move.stop} className="text-xs text-slate-500 hover:text-ink-800">Keep my current time</button>
                  </div>
                  {move.loading && <div className="h-24 rounded-xl bg-slate-50 animate-pulse" role="status" aria-label="Loading available times" />}
                  <InlineError error={move.error} />
                  {move.unavailable && <p className="text-sm text-slate-500">This appointment can’t be moved any more. You can cancel it and book a new one.</p>}
                  {move.session && (
                    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                      <BookingScheduler session={move.session} brandColor={BRAND} onPicked={() => { move.stop(); b.settle(); }} />
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
