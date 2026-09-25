'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { formatDistanceToNow, format } from 'date-fns';
import { GET_ORDERS, DISPATCH_ORDER } from '@/graphql/orders';

const KIND_BADGE: Record<string, string> = {
  HRT:  'bg-violet-100 text-violet-700',
  GLP1: 'bg-teal-100 text-teal-700',
};

export default function OrdersPage() {
  const { data, loading, error } = useQuery(GET_ORDERS, { pollInterval: 60_000 });
  const [dispatchOrder, { loading: dispatching }] = useMutation(DISPATCH_ORDER, {
    refetchQueries: [{ query: GET_ORDERS }],
  });

  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [pharmacyRef, setPharmacyRef] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'dispatched'>('pending');

  const orders = (data?.orders ?? []).filter((o: any) => {
    if (filter === 'pending') return !o.dispatchedAt;
    if (filter === 'dispatched') return !!o.dispatchedAt;
    return true;
  });

  const allOrders = data?.orders ?? [];
  const pendingCount = allOrders.filter((o: any) => !o.dispatchedAt).length;
  const dispatchedCount = allOrders.filter((o: any) => o.dispatchedAt).length;

  const handleDispatch = async (id: string) => {
    if (!pharmacyRef.trim()) return;
    await dispatchOrder({ variables: { id, pharmacyRef: pharmacyRef.trim() } });
    setDispatchingId(null);
    setPharmacyRef('');
  };

  return (
    <div>
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Orders</h1>
          <p className="text-xs text-gray-500 mt-0.5">Prescription fulfilment and dispatch tracking</p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="text-center">
            <p className="font-semibold text-gray-900">{allOrders.length}</p>
            <p className="text-xs text-gray-400">Total</p>
          </div>
          <div className="text-center">
            <p className="font-semibold text-amber-600">{pendingCount}</p>
            <p className="text-xs text-gray-400">Pending</p>
          </div>
          <div className="text-center">
            <p className="font-semibold text-green-600">{dispatchedCount}</p>
            <p className="text-xs text-gray-400">Dispatched</p>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-gray-200 px-6 bg-white">
        {(['pending', 'dispatched', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`py-2.5 mr-6 text-sm border-b-2 capitalize transition-colors ${
              filter === f
                ? 'border-brand-500 text-brand-900 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {f === 'all' ? 'All orders' : f}
          </button>
        ))}
      </div>

      {loading && <p className="p-6 text-sm text-gray-400">Loading…</p>}
      {error && <p className="p-6 text-sm text-red-500">{error.message}</p>}

      <div className="divide-y divide-gray-100">
        {orders.map((order: any) => {
          const patient = order.consultation?.patient;
          const isDispatching = dispatchingId === order.id;

          return (
            <div key={order.id} className="px-6 py-4 bg-white hover:bg-gray-50 flex items-start gap-5">
              {/* Status indicator */}
              <div className="mt-1 shrink-0">
                {order.dispatchedAt ? (
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-sm">✓</div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-sm">⏳</div>
                )}
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${KIND_BADGE[order.consultation?.kind] ?? 'bg-gray-100 text-gray-600'}`}>
                    {order.consultation?.kind}
                  </span>
                  {order.dispatchedAt ? (
                    <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded font-medium">Dispatched</span>
                  ) : (
                    <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-medium">Pending dispatch</span>
                  )}
                </div>

                <p className="font-medium text-gray-900 text-sm">
                  {patient?.firstName} {patient?.lastName}
                  <span className="font-normal text-gray-400 ml-2">{patient?.email}</span>
                </p>

                <div className="mt-1.5 flex gap-4 text-xs text-gray-500">
                  <span><span className="font-medium text-gray-700">{order.medication}</span> · {order.dosage}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{order.instructions}</p>

                <div className="flex gap-4 mt-2 text-xs text-gray-400">
                  <span>Prescribed {formatDistanceToNow(new Date(order.issuedAt), { addSuffix: true })}</span>
                  {order.dispatchedAt && (
                    <span>Dispatched {format(new Date(order.dispatchedAt), 'dd MMM yyyy')}</span>
                  )}
                  {order.pharmacyRef && (
                    <span>Ref: <span className="font-mono text-gray-600">{order.pharmacyRef}</span></span>
                  )}
                </div>

                {/* Dispatch form */}
                {isDispatching && (
                  <div className="mt-3 flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Pharmacy / tracking reference…"
                      value={pharmacyRef}
                      onChange={(e) => setPharmacyRef(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-64"
                      autoFocus
                    />
                    <button
                      onClick={() => handleDispatch(order.id)}
                      disabled={!pharmacyRef.trim() || dispatching}
                      className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-40"
                    >
                      {dispatching ? '…' : 'Confirm dispatch'}
                    </button>
                    <button
                      onClick={() => { setDispatchingId(null); setPharmacyRef(''); }}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Action */}
              {!order.dispatchedAt && !isDispatching && (
                <button
                  onClick={() => setDispatchingId(order.id)}
                  className="shrink-0 px-3 py-1.5 border border-gray-200 text-sm text-gray-700 rounded-lg hover:bg-gray-100"
                >
                  Mark dispatched
                </button>
              )}
            </div>
          );
        })}

        {!loading && orders.length === 0 && (
          <div className="p-12 text-center text-gray-400 text-sm">
            {filter === 'pending' ? 'No pending orders.' : filter === 'dispatched' ? 'No dispatched orders yet.' : 'No orders yet.'}
          </div>
        )}
      </div>
    </div>
  );
}
