'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { formatDistanceToNow, format } from 'date-fns';
import { GET_ORDERS, DISPATCH_ORDER, MARK_ORDER_OUT_FOR_DELIVERY, MARK_ORDER_DELIVERED } from '@/graphql/orders';

const KIND_BADGE: Record<string, string> = {
  HRT:  'bg-violet-100 text-violet-700',
  GLP1: 'bg-teal-100 text-teal-700',
};

const ORDER_STAGES = ['Prescribed', 'Dispatched', 'Out for delivery', 'Delivered'] as const;

function orderStageIndex(order: any): number {
  if (order.deliveredAt) return 3;
  if (order.outForDeliveryAt) return 2;
  if (order.dispatchedAt) return 1;
  return 0;
}

function OrderStageTracker({ order }: { order: any }) {
  const current = orderStageIndex(order);
  return (
    <div className="flex items-center max-w-md">
      {ORDER_STAGES.map((stage, i) => (
        <div key={stage} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div className={`w-2.5 h-2.5 rounded-full ${i <= current ? 'bg-brand-500' : 'bg-gray-200'} ${i === current ? 'ring-4 ring-brand-100' : ''}`} />
            <span className={`text-[10px] mt-1 whitespace-nowrap ${i <= current ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>{stage}</span>
          </div>
          {i < ORDER_STAGES.length - 1 && (
            <div className={`h-0.5 flex-1 mx-1.5 mb-4 ${i < current ? 'bg-brand-500' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function OrdersPage() {
  const { data, loading, error } = useQuery(GET_ORDERS, { pollInterval: 60_000 });
  const [dispatchOrder, { loading: dispatching }] = useMutation(DISPATCH_ORDER, {
    refetchQueries: [{ query: GET_ORDERS }],
  });
  const [markOutForDelivery, { loading: shipping }] = useMutation(MARK_ORDER_OUT_FOR_DELIVERY, {
    refetchQueries: [{ query: GET_ORDERS }],
  });
  const [markDelivered, { loading: delivering }] = useMutation(MARK_ORDER_DELIVERED, {
    refetchQueries: [{ query: GET_ORDERS }],
  });

  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [pharmacyRef, setPharmacyRef] = useState('');
  const [shippingId, setShippingId] = useState<string | null>(null);
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [filter, setFilter] = useState<'pending' | 'in_transit' | 'delivered' | 'all'>('pending');

  const allOrders = data?.orders ?? [];
  const orders = allOrders.filter((o: any) => {
    const stage = orderStageIndex(o);
    if (filter === 'pending') return stage === 0;
    if (filter === 'in_transit') return stage === 1 || stage === 2;
    if (filter === 'delivered') return stage === 3;
    return true;
  });

  const pendingCount = allOrders.filter((o: any) => orderStageIndex(o) === 0).length;
  const inTransitCount = allOrders.filter((o: any) => [1, 2].includes(orderStageIndex(o))).length;
  const deliveredCount = allOrders.filter((o: any) => orderStageIndex(o) === 3).length;

  const handleDispatch = async (id: string) => {
    if (!pharmacyRef.trim()) return;
    await dispatchOrder({ variables: { id, pharmacyRef: pharmacyRef.trim() } });
    setDispatchingId(null);
    setPharmacyRef('');
  };

  const handleMarkOutForDelivery = async (id: string) => {
    await markOutForDelivery({
      variables: {
        id,
        carrier: carrier.trim() || null,
        trackingNumber: trackingNumber.trim() || null,
        trackingUrl: trackingUrl.trim() || null,
      },
    });
    setShippingId(null);
    setCarrier('');
    setTrackingNumber('');
    setTrackingUrl('');
  };

  const handleMarkDelivered = async (id: string) => {
    await markDelivered({ variables: { id } });
  };

  return (
    <div>
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Orders</h1>
          <p className="text-xs text-gray-500 mt-0.5">Prescription fulfilment and delivery tracking</p>
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
            <p className="font-semibold text-blue-600">{inTransitCount}</p>
            <p className="text-xs text-gray-400">In transit</p>
          </div>
          <div className="text-center">
            <p className="font-semibold text-green-600">{deliveredCount}</p>
            <p className="text-xs text-gray-400">Delivered</p>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-gray-200 px-6 bg-white">
        {([
          { key: 'pending', label: 'Pending' },
          { key: 'in_transit', label: 'In transit' },
          { key: 'delivered', label: 'Delivered' },
          { key: 'all', label: 'All orders' },
        ] as const).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`py-2.5 mr-6 text-sm border-b-2 transition-colors ${
              filter === f.key
                ? 'border-brand-500 text-brand-900 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <p className="p-6 text-sm text-gray-400">Loading…</p>}
      {error && <p className="p-6 text-sm text-red-500">{error.message}</p>}

      <div className="divide-y divide-gray-100">
        {orders.map((order: any) => {
          const patient = order.consultation?.patient;
          const isDispatching = dispatchingId === order.id;
          const isShipping = shippingId === order.id;
          const stage = orderStageIndex(order);

          return (
            <div key={order.id} className="px-6 py-4 bg-white hover:bg-gray-50">
              <div className="flex items-start gap-5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${KIND_BADGE[order.consultation?.kind] ?? 'bg-gray-100 text-gray-600'}`}>
                      {order.consultation?.kind}
                    </span>
                    <span className="text-xs text-gray-700 font-medium">{ORDER_STAGES[stage]}</span>
                  </div>

                  <p className="font-medium text-gray-900 text-sm">
                    {patient?.firstName} {patient?.lastName}
                    <span className="font-normal text-gray-400 ml-2">{patient?.email}</span>
                  </p>

                  <div className="mt-1.5 flex gap-4 text-xs text-gray-500">
                    <span><span className="font-medium text-gray-700">{order.medication}</span> · {order.dosage}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{order.instructions}</p>

                  <div className="mt-3 max-w-md">
                    <OrderStageTracker order={order} />
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-gray-400">
                    <span>Prescribed {formatDistanceToNow(new Date(order.issuedAt), { addSuffix: true })}</span>
                    {order.dispatchedAt && <span>Dispatched {format(new Date(order.dispatchedAt), 'dd MMM yyyy')}</span>}
                    {order.outForDeliveryAt && <span>Out for delivery {format(new Date(order.outForDeliveryAt), 'dd MMM yyyy')}</span>}
                    {order.deliveredAt && <span>Delivered {format(new Date(order.deliveredAt), 'dd MMM yyyy')}</span>}
                    {order.pharmacyRef && (
                      <span>Ref: <span className="font-mono text-gray-600">{order.pharmacyRef}</span></span>
                    )}
                  </div>

                  {(order.carrier || order.trackingNumber || order.trackingUrl) && (
                    <div className="mt-1 text-xs text-gray-500">
                      {order.carrier && <span>{order.carrier} </span>}
                      {order.trackingNumber && <span className="font-mono">{order.trackingNumber}</span>}
                      {order.trackingUrl && (
                        <a href={order.trackingUrl} target="_blank" rel="noreferrer" className="text-brand-500 hover:text-brand-900 ml-2">
                          Track package →
                        </a>
                      )}
                    </div>
                  )}

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

                  {/* Out-for-delivery form */}
                  {isShipping && (
                    <div className="mt-3 space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Carrier (e.g. Royal Mail)"
                          value={carrier}
                          onChange={(e) => setCarrier(e.target.value)}
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-40"
                          autoFocus
                        />
                        <input
                          type="text"
                          placeholder="Tracking number"
                          value={trackingNumber}
                          onChange={(e) => setTrackingNumber(e.target.value)}
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-40"
                        />
                        <input
                          type="text"
                          placeholder="Tracking URL (optional)"
                          value={trackingUrl}
                          onChange={(e) => setTrackingUrl(e.target.value)}
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 flex-1"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleMarkOutForDelivery(order.id)}
                          disabled={shipping}
                          className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-40"
                        >
                          {shipping ? '…' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => { setShippingId(null); setCarrier(''); setTrackingNumber(''); setTrackingUrl(''); }}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="shrink-0 flex flex-col gap-2">
                  {!order.dispatchedAt && !isDispatching && (
                    <button
                      onClick={() => setDispatchingId(order.id)}
                      className="px-3 py-1.5 border border-gray-200 text-sm text-gray-700 rounded-lg hover:bg-gray-100"
                    >
                      Mark dispatched
                    </button>
                  )}
                  {order.dispatchedAt && !order.outForDeliveryAt && !isShipping && (
                    <button
                      onClick={() => setShippingId(order.id)}
                      className="px-3 py-1.5 border border-gray-200 text-sm text-gray-700 rounded-lg hover:bg-gray-100"
                    >
                      Mark out for delivery
                    </button>
                  )}
                  {order.outForDeliveryAt && !order.deliveredAt && (
                    <button
                      onClick={() => handleMarkDelivered(order.id)}
                      disabled={delivering}
                      className="px-3 py-1.5 border border-gray-200 text-sm text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-40"
                    >
                      {delivering ? '…' : 'Mark delivered'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {!loading && orders.length === 0 && (
          <div className="p-12 text-center text-gray-400 text-sm">
            {filter === 'pending' ? 'No pending orders.' : filter === 'in_transit' ? 'No orders in transit.' : filter === 'delivered' ? 'No delivered orders yet.' : 'No orders yet.'}
          </div>
        )}
      </div>
    </div>
  );
}
