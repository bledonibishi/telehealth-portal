'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { BookingScheduler, useBooking, useReschedule, type Booking } from '@telehealth/booking';
import { Icon } from '@/components/portal/Icon';
import { btnOutline } from '@/components/portal/Card';
import { ErrorAlert } from '@/components/common/Alert';
import { InlineError } from '@/components/common/Alert';

/** The portal's navy, so the scheduler's buttons match the page around it. */
const BRAND = '#132f6f';

/**
 * Pick a time for something — an appointment request today, anything with a booking purpose tomorrow.
 * Shows the scheduler until a time is held, then the booking with ways to move or cancel it. Renders
 * `fallback` when online booking isn't set up for the purpose, so the caller's old flow still works.
 */
export function BookingCard({ purpose, referenceId, onChange, fallback = null }: { purpose: string; referenceId?: string | null; onChange?: (current: Booking | null) => void; fallback?: React.ReactNode }) {
  const b = useBooking(purpose, referenceId, { onChange });
  const move = useReschedule();
  const moving = !!move.uid;
  const [problem, setProblem] = useState<unknown>(null);

  if (b.loading && !b.session) return <div className="h-24 rounded-xl bg-slate-50 animate-pulse" role="status" aria-label="Loading available times" />;
  if (b.error) return <ErrorAlert error={b.error} title="We couldn’t load the available times" />;
  if (!b.session) return <>{fallback}</>;

  const cancel = async () => {
    setProblem(null);
    try {
      await b.cancel('Cancelled by the patient');
    } catch (err: any) {
      setProblem(err);
    }
  };

  if (b.confirming) {
    return (
      <div role="status" className="rounded-xl bg-ink-50 p-4 text-sm text-ink-900">
        <b>Saving your time…</b>
        {b.picked?.startTime && <span className="text-slate-600"> {format(new Date(b.picked.startTime), 'EEEE d MMMM · HH:mm')}</span>}
      </div>
    );
  }

  if (b.current && !moving) {
    const c = b.current;
    return (
      <div className="rounded-xl bg-ink-50 p-4">
        <p className="text-sm font-semibold text-ink-900 flex items-center gap-2">
          <Icon name="calendar" className="w-4 h-4" /> {format(new Date(c.startsAt), 'EEEE d MMMM · HH:mm')}–{format(new Date(c.endsAt), 'HH:mm')}
          {c.status === 'PENDING' && <span className="text-[11px] font-semibold rounded-full bg-amber-50 text-amber-700 px-2 py-0.5">Waiting for your doctor to confirm</span>}
        </p>
        {c.hostName && <p className="text-xs text-slate-600 mt-1">With {c.hostName}</p>}
        {c.location && <p className="text-xs text-slate-600 mt-0.5">{c.location}</p>}
        <div className="flex flex-wrap items-center gap-3 mt-3">
          {c.meetingUrl && <a href={c.meetingUrl} target="_blank" rel="noreferrer" className={`${btnOutline} !py-1.5 !text-xs bg-white`}>Join video call <Icon name="arrow" className="w-3.5 h-3.5" /></a>}
          {c.canReschedule && <button type="button" onClick={() => move.start(c.uid)} className="text-xs font-medium text-ink-600 hover:text-ink-800">Change time</button>}
          <button type="button" onClick={cancel} disabled={b.cancelling} className="text-xs font-medium text-slate-500 hover:text-red-600">{b.cancelling ? 'Cancelling…' : 'Cancel booking'}</button>
        </div>
        <InlineError error={problem} size="xs" className="mt-2" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-sm font-semibold text-ink-900">{moving ? 'Choose a new time' : `Pick a time · ${b.session.label}`}</p>
        {moving && <button type="button" onClick={move.stop} className="text-xs text-slate-500 hover:text-ink-800">Keep my current time</button>}
      </div>
      {moving && move.loading && <div className="h-24 rounded-xl bg-slate-50 animate-pulse" role="status" aria-label="Loading available times" />}
      {moving && move.unavailable && <p className="text-sm text-slate-500">This appointment can’t be moved any more.</p>}
      {(moving ? move.session : b.session) && (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <BookingScheduler session={(moving ? move.session : b.session)!} brandColor={BRAND} onPicked={(t) => { move.stop(); b.onPicked(t); }} />
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-2">Times are shown in your own time zone. You’ll get a confirmation by email.</p>
    </div>
  );
}
