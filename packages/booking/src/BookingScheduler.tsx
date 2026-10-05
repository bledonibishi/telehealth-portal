'use client';

import { useEffect, useId, useRef } from 'react';
import Cal, { getCalApi } from '@calcom/embed-react';
import type { BookingSession, PickedTime } from './types';

export interface BookingSchedulerProps {
  /** From `useBooking` (a new booking) or `useReschedule` (moving one): which event to open, who is booking, and the signed token. */
  session: BookingSession;
  /** Called as soon as a time is picked or moved. Our own record follows by webhook a moment later. */
  onPicked?: (time: PickedTime) => void;
  /** Hex colour for the scheduler's buttons and selected day, to match the app around it. */
  brandColor?: string;
  theme?: 'light' | 'dark';
  layout?: 'month_view' | 'week_view' | 'column_view';
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Cal.com's scheduler, inline, already knowing who is booking. It carries no styling of its own beyond its
 * size, so it sits inside whatever card the app gives it. The patient's name and email are prefilled, and
 * the signed token rides along as booking metadata so our webhook can tie the booking to them — nothing
 * about their health is sent.
 */
export function BookingScheduler({ session, onPicked, brandColor, theme = 'light', layout = 'month_view', className, style }: BookingSchedulerProps) {
  // One namespace per mounted scheduler, so two on a page (or a remount) don't share listeners.
  const namespace = `booking${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const picked = useRef(onPicked);
  picked.current = onPicked;
  const embedJsUrl = session.calOrigin ? `${session.calOrigin}/embed/embed.js` : undefined;

  useEffect(() => {
    let live = true;
    (async () => {
      const cal: any = await getCalApi({ namespace, ...(embedJsUrl && { embedJsUrl }) });
      if (!live) return;
      cal('ui', { theme, hideEventTypeDetails: false, layout, ...(brandColor && { cssVarsPerTheme: { light: { 'cal-brand': brandColor }, dark: { 'cal-brand': brandColor } } }) });
      const report = (e: any) => live && picked.current?.(e?.detail?.data ?? {});
      cal('on', { action: 'bookingSuccessfulV2', callback: report });
      cal('on', { action: 'rescheduleBookingSuccessfulV2', callback: report });
    })();
    return () => {
      live = false;
    };
  }, [namespace, embedJsUrl, theme, layout, brandColor]);

  return (
    <Cal
      namespace={namespace}
      calLink={session.calLink}
      {...(session.calOrigin && { calOrigin: session.calOrigin, embedJsUrl })}
      config={{ layout, theme, name: session.name, email: session.email, 'metadata[bookingToken]': session.token, ...(session.notes && { notes: session.notes }), ...(session.rescheduleUid && { rescheduleUid: session.rescheduleUid }) } as any}
      className={className}
      style={{ width: '100%', minHeight: 520, overflow: 'auto', ...style }}
    />
  );
}
