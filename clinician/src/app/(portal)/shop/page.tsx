'use client';

import ShopDesk from '@/components/shop/ShopDesk';
import { useI18n } from '@/lib/i18n/I18nProvider';

/** The website shop (products sold without a prescription): orders to send, refunds, products and fiscal receipts. */
export default function ShopPage() {
  const { t } = useI18n();
  return (
    <div>
      <div data-guide="page-header" className="px-4 sm:px-6 py-5 border-b border-gray-200 bg-white">
        <h1 className="text-lg font-semibold text-gray-900">{t('Shop')}</h1>
        <p className="text-xs text-gray-500 mt-0.5">{t('Products sold on the website without a prescription, their orders and fiscal receipts')}</p>
      </div>
      <ShopDesk />
    </div>
  );
}
