'use client';

import { useQuery } from '@apollo/client';
import { REFUND_REQUESTS } from '@/graphql/orders';
import { useI18n } from '@/lib/i18n/I18nProvider';

/**
 * Patients asking for their money back (admin only). The decision is made on the Billing page, where the payments and
 * supplies are in front of you and a refund needs confirming. This box only says that requests are waiting.
 */
export function RefundRequests() {
  const { t, timeAgo } = useI18n();
  const { data } = useQuery(REFUND_REQUESTS, { pollInterval: 60_000, fetchPolicy: 'cache-and-network' });
  const requests: any[] = data?.refundRequests ?? [];
  if (requests.length === 0) return null;

  return (
    <div className="mx-4 sm:mx-6 mt-4 rounded-md border border-amber-200 bg-amber-50 px-5 py-4">
      <p className="text-sm font-semibold text-amber-900">
        {t('Refund requests')} ({requests.length})
        <a href="/billing" className="ml-3 inline-block rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700">{t('Review in Billing')}</a>
      </p>
      <ul className="mt-2 divide-y divide-amber-200">
        {requests.map((r) => (
          <li key={r.id} className="py-2 text-sm text-gray-900">
            {r.patientName} <span className="text-gray-500">· {r.patientEmail} · {timeAgo(r.requestedAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
