'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApolloClient, useQuery } from '@apollo/client';
import { GET_ORDERS, NEXT_SHIPMENT_ALERTS, PHARMACY_STATEMENT } from '@/graphql/orders';
import { OrderCard } from '@/components/orders/OrderCard';
import { RefundRequests } from '@/components/orders/RefundRequests';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { hasAccess } from '@/lib/role';
import { openProblem, overdueSince } from '@/lib/tracking';
import { orderMatchesSearch } from '@/lib/order-search';

type Order = any;

// The pharmacy's day, in the order things happen to an order: pack it, hand it over, the courier takes it from there.
const FILTERS = [
  // An order the pharmacy has said it can't supply is no longer theirs to pack: it waits under Problems for our team.
  { key: 'to_pack', label: 'To pack', match: (o: Order) => o.status === 'PENDING' && !o.readyForPickupAt && openProblem(o.trackingEvents)?.status !== 'CANNOT_FULFIL' },
  { key: 'ready', label: 'Ready for pickup', match: (o: Order) => o.status === 'PENDING' && !!o.readyForPickupAt },
  { key: 'with_courier', label: 'With the courier', match: (o: Order) => o.status === 'DISPATCHED' || o.status === 'OUT_FOR_DELIVERY' },
  { key: 'problems', label: 'Problems', match: (o: Order) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED' && (!!openProblem(o.trackingEvents) || !!overdueSince(o)) },
  { key: 'delivered', label: 'Delivered', match: (o: Order) => o.status === 'DELIVERED' },
  { key: 'cancelled', label: 'Cancelled', match: (o: Order) => o.status === 'CANCELLED' },
  { key: 'all', label: 'All orders', match: () => true },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

const EMPTY: Record<FilterKey, string> = {
  to_pack: 'Nothing to pack right now. New orders appear here as soon as a doctor approves a prescription.',
  ready: 'No parcels waiting for the courier.',
  with_courier: 'No parcels with the courier.',
  problems: 'No delivery problems. A parcel the courier reports as a problem, or one past its expected date, shows here.',
  delivered: 'No delivered orders yet.',
  cancelled: 'No cancelled orders.',
  all: 'No orders yet.',
};

// What each headline number means and how it looks; they double as shortcuts to the matching list.
const TILES: Array<{ key: FilterKey; label: string; hint: string; tone: string }> = [
  { key: 'to_pack', label: 'To pack', hint: 'Waiting for you', tone: 'text-amber-600' },
  { key: 'ready', label: 'Ready for pickup', hint: 'Waiting for the courier', tone: 'text-brand-500' },
  { key: 'with_courier', label: 'With the courier', hint: 'On their way to patients', tone: 'text-blue-600' },
  { key: 'problems', label: 'Problems', hint: 'Need a call', tone: 'text-red-600' },
  { key: 'delivered', label: 'Delivered', hint: 'Done', tone: 'text-green-600' },
];

export default function OrdersPage() {
  const { t } = useI18n();
  // Placing a repeat from the shipments page changes this list, so always check again on arrival.
  const [chosen, setChosen] = useState<FilterKey | null>(null);
  const [query, setQuery] = useState('');
  // Typing narrows the list at once; after a pause the server looks through older orders too (the list only holds recent ones).
  const [serverQuery, setServerQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setServerQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);
  const { data, previousData, loading, error } = useQuery(GET_ORDERS, {
    variables: { search: serverQuery || undefined },
    pollInterval: 60_000,
    fetchPolicy: 'cache-and-network',
  });
  // The shipments list shows other patients' supplies, which the pharmacy partner doesn't see.
  const canSeeShipments = hasAccess(['ADMIN', 'DOCTOR']);
  const isAdmin = hasAccess(['ADMIN']);
  const client = useApolloClient();
  const [statementMonth, setStatementMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [statementError, setStatementError] = useState('');
  async function downloadStatement() {
    setStatementError('');
    const [year, month] = statementMonth.split('-').map(Number);
    try {
      const { data } = await client.query({ query: PHARMACY_STATEMENT, variables: { year, month }, fetchPolicy: 'network-only' });
      const url = URL.createObjectURL(new Blob([data.pharmacyStatement], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `pharmacy-statement-${statementMonth}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setStatementError((e as Error).message);
    }
  }
  const { data: shipmentData } = useQuery(NEXT_SHIPMENT_ALERTS, { pollInterval: 60_000, skip: !canSeeShipments });
  const shipmentsDue = (shipmentData?.nextShipmentAlerts ?? []).filter((a: any) => a.urgency !== 'UPCOMING').length;

  const allOrders: Order[] = (data ?? previousData)?.orders ?? [];
  const countIn = (list: Order[], key: FilterKey) => list.filter(FILTERS.find((f) => f.key === key)!.match).length;

  // A search narrows whatever list you are looking at, and says what it found in the other tabs.
  const searching = query.trim() !== '';
  const matched = searching ? allOrders.filter((o) => orderMatchesSearch(o, query)) : allOrders;
  const count = (key: FilterKey) => countIn(allOrders, key);

  // Open on whatever needs attention first, until someone picks a tab. A search never moves you off the tab you are on.
  const filter: FilterKey = chosen ?? (['problems', 'to_pack', 'ready', 'with_courier'] as FilterKey[]).find((k) => count(k) > 0) ?? 'to_pack';
  const active = FILTERS.find((f) => f.key === filter)!;
  const orders = matched.filter(active.match);
  const elsewhere = searching ? FILTERS.filter((f) => f.key !== filter && f.key !== 'all').map((f) => ({ key: f.key, label: f.label, n: countIn(matched, f.key) })).filter((x) => x.n > 0) : [];
  const pick = (key: FilterKey) => setChosen(key);
  const isPharmacy = hasAccess(['PROVIDER']);

  return (
    <div>
      {isAdmin && <RefundRequests />}
      <div className="px-6 pt-5 pb-4 border-b border-gray-200 bg-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{t('Orders')}</h1>
            <p className="text-xs text-gray-500 mt-0.5">{t('Pack, hand over to the courier, and follow each parcel until it arrives')}</p>
          </div>
          {isAdmin && (
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <input type="month" value={statementMonth} onChange={(e) => setStatementMonth(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700" aria-label={t('Month')} />
                <button type="button" onClick={downloadStatement} className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">{t('Pharmacy statement (CSV)')}</button>
              </div>
              {statementError && <p className="text-xs text-danger-500">{statementError}</p>}
            </div>
          )}
          {canSeeShipments && (
            <Link href="/shipments" className="text-xs text-gray-500 hover:text-gray-800" title={t('Next shipments')}>
              <span className={`font-semibold ${shipmentsDue ? 'text-red-600' : 'text-gray-400'}`}>{shipmentsDue}</span> {t('shipments due')} →
            </Link>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
          {TILES.map((tile) => {
            const n = count(tile.key);
            const on = filter === tile.key;
            const urgent = tile.key === 'problems' && n > 0;
            return (
              <button
                key={tile.key}
                type="button"
                onClick={() => pick(tile.key)}
                aria-pressed={on}
                className={`text-left rounded-xl border px-4 py-3 transition-colors ${
                  on ? 'border-brand-500 bg-brand-50' : urgent ? 'border-danger-500 bg-danger-50' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <p className={`text-2xl font-semibold leading-none ${n ? tile.tone : 'text-gray-300'}`}>{n}</p>
                <p className="text-sm font-medium text-gray-800 mt-2">{t(tile.label)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t(tile.hint)}</p>
              </button>
            );
          })}
        </div>

        {isPharmacy && (
          <details open={count('to_pack') > 0 || undefined} className="mt-4 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600">
            <summary className="cursor-pointer font-medium text-gray-800">{t('How it works')}</summary>
            <ol className="mt-2 space-y-1.5 list-decimal list-inside">
              <li>{t('Pack the order shown under “To pack” and print its packing slip. Put the parcel code on the parcel.')}</li>
              <li>{t('Press “Ready for pickup”. When the courier collects it, they quote the code, and you press “Handed to courier”.')}</li>
              <li>{t('From then on we take care of the delivery and follow it for you. You don’t enter a courier, tracking or address. The patient is emailed when it ships and when it arrives.')}</li>
              <li>{t('If something goes wrong with a delivery, it appears under “Problems” — contact the courier.')}</li>
            </ol>
          </details>
        )}
      </div>

      <div className="px-6 py-3 border-b border-gray-200 bg-white">
        <div className="relative max-w-xl">
          <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="9" cy="9" r="5.5" />
            <path d="M13.5 13.5L17 17" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
            placeholder={t('Search by name, parcel code or tracking number')}
            aria-label={t('Search orders')}
            className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-400 hover:border-gray-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {searching && (
            <button type="button" onClick={() => setQuery('')} aria-label={t('Clear search')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" /></svg>
            </button>
          )}
        </div>
        {searching && (
          <p className="mt-2 text-xs text-gray-500">
            {t('{n} in “{tab}”', { n: orders.length, tab: t(active.label) })}
            {elsewhere.length > 0 && (
              <>
                {' · '}
                {t('Also in')}{' '}
                {elsewhere.map((x, i) => (
                  <span key={x.key}>
                    {i > 0 && ', '}
                    <button type="button" onClick={() => pick(x.key)} className="font-medium text-brand-500 hover:underline">
                      {t(x.label)} ({x.n})
                    </button>
                  </span>
                ))}
              </>
            )}
          </p>
        )}
      </div>

      <div className="flex border-b border-gray-200 px-6 bg-white overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setChosen(f.key)}
            className={`py-2.5 mr-6 text-sm border-b-2 whitespace-nowrap transition-colors ${
              filter === f.key ? 'border-brand-500 text-brand-900 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t(f.label)}
            {f.key !== 'all' && countIn(matched, f.key) > 0 && <span className={`ml-1.5 text-xs ${searching ? 'font-semibold text-brand-500' : 'text-gray-400'}`}>{countIn(matched, f.key)}</span>}
          </button>
        ))}
      </div>

      {loading && !data && <p className="p-6 text-sm text-gray-400">{t('Loading…')}</p>}
      {error && <p className="p-6 text-sm text-red-500">{error.message}</p>}

      <div className="divide-y divide-gray-100">
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} refetchQueries={[{ query: GET_ORDERS }]} />
        ))}
        {!loading && orders.length === 0 && (
          <div className="p-12 text-center text-gray-400 text-sm max-w-md mx-auto">
            {searching
              ? elsewhere.length > 0
                ? t('Nothing in this tab matches “{q}”. See the other tabs above.', { q: query.trim() })
                : t('No orders match “{q}”. Try a name, the parcel code or a tracking number.', { q: query.trim() })
              : t(EMPTY[filter])}
          </div>
        )}
      </div>
    </div>
  );
}
