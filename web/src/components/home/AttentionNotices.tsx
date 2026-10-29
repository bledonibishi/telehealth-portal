'use client';

import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { MY_ORDERS } from '@/graphql/orders';
import { MY_APPOINTMENTS } from '@/graphql/portal';

/** One line that needs the patient's attention, with the action beside it. */
export function Notice({ tone, title, text, href, action }: { tone: 'warn' | 'info'; title: string; text: string; href: string; action: string }) {
  return (
    <div className={`rounded-md border px-4 py-2.5 flex items-center justify-between gap-3 ${tone === 'warn' ? 'bg-orange-50 border-orange-100' : 'bg-white border-slate-200/70'}`}>
      <p className="text-sm min-w-0"><b className="text-ink-900">{title}</b> <span className="text-slate-600">{text}</span></p>
      <Link href={href} className="flex-shrink-0 text-sm font-semibold text-ink-700 hover:text-ink-900 py-1">{action}</Link>
    </div>
  );
}

/**
 * What is waiting on the patient and would otherwise sit unnoticed in another page: a supply or a consultation to pay for,
 * and a choice about a cancelled appointment. Each line goes to the page where it is done. Nothing shows when nothing waits.
 */
export function AttentionNotices() {
  const { data: orders } = useQuery(MY_ORDERS, { fetchPolicy: 'cache-and-network' });
  const { data: appts } = useQuery(MY_APPOINTMENTS, { fetchPolicy: 'cache-and-network' });
  const awaiting = ((orders?.myOrders ?? []) as any[]).filter((o) => o.status === 'AWAITING_PAYMENT');
  const toPay = awaiting.some((o) => o.paymentUrl);
  // Approved, but the payment link is still being made (the server retries it): nothing to pay yet.
  const linkComing = !toPay && awaiting.length > 0;
  const list = (appts?.myAppointments ?? []) as any[];
  const consultToPay = list.some((a) => a.status === 'AWAITING_PAYMENT');
  const refundChoice = list.some((a) => a.refundOffered);

  return (
    <>
      {toPay && <Notice tone="warn" title="A supply is waiting for your payment." text="Your doctor approved it. Once it is paid, it goes to the pharmacy." href="/orders" action="Pay now →" />}
      {linkComing && <Notice tone="info" title="Your doctor approved your next supply." text="We’re preparing your payment link; it will be ready shortly." href="/orders" action="View →" />}
      {refundChoice && <Notice tone="warn" title="Your doctor can’t make an appointment." text="Choose a new time or a refund." href="/appointments" action="Choose →" />}
      {consultToPay && <Notice tone="warn" title="An appointment request is waiting for your payment." text="It reaches your doctor once it is paid." href="/appointments" action="Pay now →" />}
    </>
  );
}
