'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { GET_ORDERS } from '@/graphql/orders';
import { OrderCard } from '@/components/orders/OrderCard';
import { useI18n } from '@/lib/i18n/I18nProvider';

const FILTERS = [
  { key: 'pending', label: 'To dispatch', statuses: ['PENDING'] },
  { key: 'in_transit', label: 'In transit', statuses: ['DISPATCHED', 'OUT_FOR_DELIVERY'] },
  { key: 'delivered', label: 'Delivered', statuses: ['DELIVERED'] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['CANCELLED'] },
  { key: 'all', label: 'All orders', statuses: null },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

const EMPTY: Record<FilterKey, string> = {
  pending: 'Nothing waiting to be dispatched.',
  in_transit: 'No orders in transit.',
  delivered: 'No delivered orders yet.',
  cancelled: 'No cancelled orders.',
  all: 'No orders yet.',
};

export default function OrdersPage() {
  const { t } = useI18n();
  const { data, loading, error } = useQuery(GET_ORDERS, { pollInterval: 60_000 });
  const [filter, setFilter] = useState<FilterKey>('pending');

  const allOrders: any[] = data?.orders ?? [];
  const countFor = (statuses: readonly string[] | null) =>
    statuses ? allOrders.filter((o) => statuses.includes(o.status)).length : allOrders.length;
  const active = FILTERS.find((f) => f.key === filter)!;
  const orders = active.statuses ? allOrders.filter((o) => (active.statuses as readonly string[]).includes(o.status)) : allOrders;

  return (
    <div>
      <div className="px-6 py-5 border-b border-gray-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t('Orders')}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{t('Each supply of a prescription — first fills and repeats')}</p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="text-center">
            <p className="font-semibold text-amber-600">{countFor(['PENDING'])}</p>
            <p className="text-xs text-gray-400">{t('To dispatch')}</p>
          </div>
          <div className="text-center">
            <p className="font-semibold text-blue-600">{countFor(['DISPATCHED', 'OUT_FOR_DELIVERY'])}</p>
            <p className="text-xs text-gray-400">{t('In transit')}</p>
          </div>
          <div className="text-center">
            <p className="font-semibold text-green-600">{countFor(['DELIVERED'])}</p>
            <p className="text-xs text-gray-400">{t('Delivered')}</p>
          </div>
        </div>
      </div>

      <div className="flex border-b border-gray-200 px-6 bg-white">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`py-2.5 mr-6 text-sm border-b-2 transition-colors ${
              filter === f.key ? 'border-brand-500 text-brand-900 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t(f.label)}
          </button>
        ))}
      </div>

      {loading && <p className="p-6 text-sm text-gray-400">{t('Loading…')}</p>}
      {error && <p className="p-6 text-sm text-red-500">{error.message}</p>}

      <div className="divide-y divide-gray-100">
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} refetchQueries={[{ query: GET_ORDERS }]} />
        ))}
        {!loading && orders.length === 0 && <div className="p-12 text-center text-gray-400 text-sm">{t(EMPTY[filter])}</div>}
      </div>
    </div>
  );
}
