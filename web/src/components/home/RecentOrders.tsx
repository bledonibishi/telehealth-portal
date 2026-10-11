'use client';

import { format } from 'date-fns';
import { useQuery } from '@apollo/client';
import { MY_ORDERS } from '@/graphql/orders';
import { ORDER_POLL_MS, expectedDelivery } from '@/lib/delivery';
import { Card, CardHeader, btnPrimary, btnOutline } from '@/components/portal/Card';
import { Icon } from '@/components/portal/Icon';
import { useRefill } from '@/lib/useRefill';
import { OrderTracker, ORDER_STATUS } from './OrderTracker';

/** The latest order with its tracker, and when the next one should be placed. */
export function RecentOrders() {
  const { data } = useQuery(MY_ORDERS, { fetchPolicy: 'cache-and-network', pollInterval: ORDER_POLL_MS });
  const refill = useRefill();
  const supply = refill.status;
  const order = (data?.myOrders ?? []).find((o: any) => o.status !== 'CANCELLED');
  const days: number | null = supply?.daysUntilNextSupply ?? null;
  const when = days == null ? null : days > 13 ? `in ${Math.round(days / 7)} weeks` : days > 1 ? `in ${days} days` : days === 1 ? 'tomorrow' : 'now';

  return (
    <Card labelledBy="orders-title" className="h-full flex flex-col">
      <CardHeader id="orders-title" title="Recent Orders" href="/orders" action="View All" />
      {order ? (
        <div className="rounded-md border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-900 truncate">{order.prescription?.medication} {order.prescription?.dosage}</p>
              <p className="text-xs text-slate-500 mt-0.5">{order.sequence === 1 ? 'First supply' : `Repeat ${order.sequence - 1}`}</p>
            </div>
            <span className={`flex-shrink-0 text-xs font-semibold rounded-full px-2.5 py-1 ${ORDER_STATUS[order.status]?.cls}`}>{ORDER_STATUS[order.status]?.label}</span>
          </div>
          <p className="text-xs text-slate-500 mt-3">Order {order.reference}</p>
          <p className="text-xs text-slate-500">Placed: {format(new Date(order.createdAt), 'd MMM yyyy')}</p>
          <div className="mt-4"><OrderTracker order={order} /></div>
          {(order.status === 'DISPATCHED' || order.status === 'OUT_FOR_DELIVERY') && expectedDelivery(order) && (
            <p className="text-xs text-ink-900 mt-3">Expected <b>{expectedDelivery(order)}</b></p>
          )}
          {order.trackingUrl ? (
            <a href={order.trackingUrl} target="_blank" rel="noreferrer" className={`${btnPrimary} w-full mt-4`}><Icon name="truck" className="w-4 h-4" /> Track Order</a>
          ) : (
            <p className="text-[11px] text-slate-400 mt-4 text-center">The pharmacy adds the tracking link once your order has shipped.</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500 bg-slate-50 rounded-md p-4">Your first order appears here once your doctor has prescribed your treatment.</p>
      )}

      {when && (
        <div className="mt-auto pt-4">
          <div className="flex flex-wrap items-center gap-3 rounded-md bg-slate-50 p-3">
            <Icon name="calendar" className="w-5 h-5 text-ink-700 flex-shrink-0" />
            <div className="min-w-[8rem] flex-1">
              <p className="text-xs font-semibold text-ink-900">Next order reminder</p>
              <p className="text-[11px] text-slate-500">{refill.requested ? 'Requested — waiting for your doctor' : `Your next order is recommended ${when}`}</p>
            </div>
            {!refill.requested && (
              <button type="button" onClick={refill.request} disabled={!refill.canRequest || refill.loading} title={refill.hint ?? undefined} className={`${btnOutline} !px-3 !py-1.5 !text-xs`}>
                Prepare Order
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

