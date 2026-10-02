'use client';

import { useQuery } from '@apollo/client';
import { CONSULTATION_QUEUE } from '@/graphql/consultations';
import { QueueRow } from './QueueRow';
import { useI18n } from '@/lib/i18n/I18nProvider';

export function ConsultationQueue() {
  const { t } = useI18n();
  const { data, loading, error } = useQuery(CONSULTATION_QUEUE, {
    pollInterval: 30_000,
  });

  if (loading) return <p className="text-sm text-gray-500 p-6">{t('Loading queue…')}</p>;
  if (error) return <p className="text-sm text-danger-500 p-6">{t('Failed to load queue: {message}', { message: error.message })}</p>;

  const consultations = data?.consultationQueue ?? [];

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          {t('Review Queue')}
          <span className="ml-2 text-sm font-normal text-gray-500">
            {t('{n} pending', { n: consultations.length })}
          </span>
        </h2>
      </div>

      {consultations.length === 0 ? (
        <div className="p-12 text-center text-gray-400 text-sm">{t('Queue is empty')}</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-6 py-3 w-8"></th>
              <th className="px-6 py-3">{t('Patient')}</th>
              <th className="px-6 py-3">{t('Type')}</th>
              <th className="px-6 py-3">{t('Status')}</th>
              <th className="px-6 py-3">{t('Submitted')}</th>
              <th className="px-6 py-3">{t('Risk')}</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {consultations.map((c: any) => (
              <QueueRow key={c.id} consultation={c} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
