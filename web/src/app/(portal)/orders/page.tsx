'use client';

import { useQuery } from '@apollo/client';
import { format } from 'date-fns';
import { MY_ORDERS } from '@/graphql/orders';
import { OrderTracker, ORDER_STATUS } from '@/components/home/OrderTracker';
import { OrderEarlyButton } from '@/components/home/OrderEarlyButton';
import { Card } from '@/components/portal/Card';
import { PageHeader } from '@/components/portal/PageHeader';
import { Icon } from '@/components/portal/Icon';
import { EmptyState } from '@/components/portal/EmptyState';

/** Every supply the patient has had, newest first, each with where it is. */
export default function OrdersPage() {
  const { data, loading } = useQuery(MY_ORDERS, { fetchPolicy: 'cache-and-network' });
  const orders: any[] = data?.myOrders ?? [];

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-8 max-w-4xl">
      <PageHeader title="Orders" subtitle="Your deliveries and where they are.">
        <OrderEarlyButton />
      </PageHeader>

      {loading && !orders.length && <Card><p className="text-sm text-slate-400">Loading…</p></Card>}
      {!loading && !orders.length && (
        <EmptyState icon="cart" what="Your first order" whenTreating={{ text: 'Your first supply is being prepared by the pharmacy. It shows here, with tracking, as soon as it is on its way.', action: { href: '/treatment-plan', label: 'Open My Treatment' } }} />
      )}

      <ul className="space-y-4">
        {orders.map((o) => (
          <li key={o.id}>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-ink-900">{o.prescription?.medication} {o.prescription?.dosage}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Order #{o.id.slice(-6).toUpperCase()} · {o.sequence === 1 ? 'First supply' : `Repeat ${o.sequence - 1}`} · placed {format(new Date(o.createdAt), 'd MMM yyyy')}
                  </p>
                </div>
                <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${ORDER_STATUS[o.status]?.cls}`}>{ORDER_STATUS[o.status]?.label ?? o.status}</span>
              </div>
              {o.status !== 'CANCELLED' && <div className="mt-5 max-w-xl"><OrderTracker order={o} /></div>}
              {(o.carrier || o.trackingNumber || o.trackingUrl) && (
                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                  {o.carrier && <span>{o.carrier}</span>}
                  {o.trackingNumber && <span>Tracking: <b className="text-ink-900">{o.trackingNumber}</b></span>}
                  {o.trackingUrl && <a href={o.trackingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-ink-600 hover:text-ink-800"><Icon name="truck" className="w-4 h-4" /> Track order</a>}
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
