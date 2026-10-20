'use client';

import BillingDesk from '@/components/billing/BillingDesk';
import { useI18n } from '@/lib/i18n/I18nProvider';

/** Money matters for an admin: refund requests, supplies waiting for a payment, failed cards and past decisions. */
export default function BillingPage() {
  const { t } = useI18n();
  return (
    <div>
      <div className="px-4 sm:px-6 py-5 border-b border-gray-200 bg-white">
        <h1 className="text-lg font-semibold text-gray-900">{t('Billing')}</h1>
        <p className="text-xs text-gray-500 mt-0.5">{t('Refund requests, supplies waiting to be paid for, and payments that failed')}</p>
      </div>
      <BillingDesk />
    </div>
  );
}
