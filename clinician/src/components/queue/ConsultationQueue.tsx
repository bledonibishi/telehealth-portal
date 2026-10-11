'use client';

import { useQuery } from '@apollo/client';
import { CONSULTATION_QUEUE } from '@/graphql/consultations';
import { QueueRow } from './QueueRow';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { ErrorAlert } from '@/components/ui/Alert';
import { SkeletonList } from '@telehealth/loading';

const TH = 'px-3 py-2.5 text-xs font-medium text-gray-500';

export function ConsultationQueue() {
  const { t } = useI18n();
  const { data, loading, error, refetch } = useQuery(CONSULTATION_QUEUE, {
    pollInterval: 30_000,
  });

  const consultations = data?.consultationQueue ?? [];

  return (
    <div>
      <div className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-gray-200">
        <h2 className="text-[15px] font-semibold text-gray-900">
          {t('Review Queue')}
          {!loading && !error && (
            <span className="ml-2 rounded-full border border-gray-200 bg-white px-2 py-0.5 align-middle text-xs font-medium text-gray-600">
              {t('{n} pending', { n: consultations.length })}
            </span>
          )}
        </h2>
      </div>

      <div className="px-4 sm:px-6 py-4">
        {error ? (
          <ErrorAlert error={error} title={t('Could not load the queue')} onRetry={() => refetch()} />
        ) : loading ? (
          <SkeletonList rows={6} label={t('Loading queue…')} />
        ) : consultations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-white py-16 text-center text-sm text-gray-500">{t('Queue is empty')}</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left">
                  <th className="pl-4 pr-3 py-2.5 w-0"><span className="sr-only">{t('Patient')}</span></th>
                  <th className={TH}>{t('Patient')}</th>
                  <th className={TH}>{t('Type')}</th>
                  <th className={TH}>{t('Status')}</th>
                  <th className={TH}>{t('Submitted')}</th>
                  <th className={TH}>{t('Risk')}</th>
                  <th className="pl-3 pr-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {consultations.map((c: any) => (
                  <QueueRow key={c.id} consultation={c} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
