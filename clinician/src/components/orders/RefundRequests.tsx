'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { DECIDE_REFUND_REQUEST, REFUND_REQUESTS } from '@/graphql/orders';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { InlineError } from '@/components/ui/Alert';

/** Patients asking for their money back (admin only). They give no reason, so what matters is where the order is. */
export function RefundRequests() {
  const { t, timeAgo } = useI18n();
  const { data } = useQuery(REFUND_REQUESTS, { pollInterval: 60_000, fetchPolicy: 'cache-and-network' });
  const [decide, { loading }] = useMutation(DECIDE_REFUND_REQUEST, { refetchQueries: [REFUND_REQUESTS], onError: (e) => setError(e) });
  const [endSubscription, setEndSubscription] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<unknown>(null);
  const requests: any[] = data?.refundRequests ?? [];
  if (requests.length === 0) return null;

  const where = (r: any) =>
    !r.latestOrderStatus ? t('No order yet')
    : r.latestOrderStatus === 'PENDING' ? t('Order is still at the pharmacy')
    : r.latestOrderStatus === 'DELIVERED' ? t('Order was delivered')
    : t('Order has left the pharmacy');

  return (
    <div className="mx-4 sm:mx-6 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
      <p className="text-sm font-semibold text-amber-900">{t('Refund requests')} ({requests.length})</p>
      <ul className="mt-2 divide-y divide-amber-200">
        {requests.map((r) => (
          <li key={r.id} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">{r.patientName} <span className="font-normal text-gray-500">· {r.patientEmail}</span></p>
              <p className="text-xs text-gray-600">{where(r)} · {timeAgo(r.requestedAt)}</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={endSubscription[r.id] ?? true} onChange={(e) => setEndSubscription({ ...endSubscription, [r.id]: e.target.checked })} />
              {t('End the subscription')}
            </label>
            <button
              type="button" disabled={loading}
              onClick={() => { setError(null); decide({ variables: { id: r.id, approve: true, endSubscription: endSubscription[r.id] ?? true } }); }}
              className="px-3 py-1.5 bg-danger-500 text-white text-sm rounded-lg disabled:opacity-40"
            >{t('Refund last payment')}</button>
            <button type="button" disabled={loading} onClick={() => { setError(null); decide({ variables: { id: r.id, approve: false } }); }} className="text-xs text-gray-500 hover:text-gray-800">{t('Decline')}</button>
          </li>
        ))}
      </ul>
      <InlineError error={error} size="xs" className="mt-2" />
    </div>
  );
}
