'use client';

import NextShipments from '@/components/orders/NextShipments';
import { useI18n } from '@/lib/i18n/I18nProvider';

/** Whose next supply is close or late. Open to doctors (who place the repeat) as well as operations. */
export default function ShipmentsPage() {
  const { t } = useI18n();
  return (
    <div>
      <div className="px-4 sm:px-6 py-5 border-b border-gray-200 bg-white">
        <h1 className="text-lg font-semibold text-gray-900">{t('Next shipments')}</h1>
        <p className="text-xs text-gray-500 mt-0.5">{t('Make sure no patient runs out of medicine before the next supply reaches them')}</p>
      </div>
      <NextShipments />
    </div>
  );
}
