'use client';

import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { ME_BASIC_INFO } from '@/graphql/patient';

type Address = { name?: string | null; addressLine1?: string | null; addressLine2?: string | null; city?: string | null; postcode?: string | null; country?: string | null };

const oneLine = (a: Address) => [a.addressLine1, a.addressLine2, [a.postcode, a.city].filter(Boolean).join(' '), a.country].filter(Boolean).join(', ');

/**
 * Where an order goes. Once it has been dispatched the address it went to is fixed, so that is shown as it
 * was sent. Until then the order goes to the address on the patient's profile, which they can still change.
 */
export function DeliveryAddress({ order }: { order: { status: string; shippingAddress?: Address | null } }) {
  const sent = order.shippingAddress;
  const waiting = order.status === 'PENDING';
  // Only needed while the order has not left: skip the request otherwise.
  const { data } = useQuery(ME_BASIC_INFO, { skip: !waiting || !!sent, fetchPolicy: 'cache-first' });
  const profile: Address | null = data?.me ?? null;

  if (sent) return <p className="text-xs text-slate-600">{waiting ? 'Delivering to' : 'Sent to'}: <b className="text-ink-900 font-semibold">{oneLine(sent)}</b></p>;
  if (!waiting || order.status === 'CANCELLED') return null;
  const line = profile ? oneLine(profile) : '';
  return (
    <p className="text-xs text-slate-600">
      Will be delivered to: <b className="text-ink-900 font-semibold">{line || 'the address on your profile'}</b>{' '}
      <Link href="/profile" className="font-semibold text-ink-600 hover:text-ink-800">Change address</Link>
      <span className="block text-slate-400 mt-0.5">Wrong address? Update it now, before it is sent, and message your care team if this order is already with the pharmacy.</span>
    </p>
  );
}
