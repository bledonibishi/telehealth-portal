'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { RiskBadge } from '@/components/consultation/RiskBadge';

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  SUBMITTED: { label: 'New', cls: 'bg-blue-100 text-blue-800' },
  IN_REVIEW: { label: 'In review', cls: 'bg-yellow-100 text-yellow-800' },
  MORE_INFO_REQUESTED: { label: 'Awaiting info', cls: 'bg-orange-100 text-orange-800' },
  APPROVED: { label: 'Approved', cls: 'bg-green-100 text-green-800' },
  DECLINED: { label: 'Declined', cls: 'bg-gray-100 text-gray-600' },
};

export function QueueRow({ consultation }: { consultation: any }) {
  const { t, timeAgo } = useI18n();
  const { id, patient, kind, status, submittedAt, redFlags, clinician, riskTag } = consultation;
  const hasCritical = redFlags.some((f: any) => f.severity === 'CRITICAL');
  const hasWarning = redFlags.some((f: any) => f.severity === 'WARNING');
  const badge = STATUS_LABELS[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };

  return (
    <tr className={`hover:bg-gray-50 ${hasCritical ? 'bg-danger-50' : ''}`}>
      <td className="px-6 py-3 text-center">
        {hasCritical && (
          <span title={t('Critical red flag')} className="inline-block w-2 h-2 rounded-full bg-danger-500" />
        )}
      </td>
      <td className="px-6 py-3 font-medium text-gray-900">
        {patient.firstName} {patient.lastName}
        <div className="text-xs text-gray-400">{patient.email}</div>
      </td>
      <td className="px-6 py-3 text-gray-600">{kind}</td>
      <td className="px-6 py-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
          {t(badge.label)}
        </span>
        {status === 'IN_REVIEW' && clinician && (
          <div className="text-xs text-gray-400 mt-0.5">{t('Dr {name}', { name: clinician.lastName })}</div>
        )}
      </td>
      <td className="px-6 py-3 text-gray-500 text-xs whitespace-nowrap">
        {timeAgo(submittedAt)}
      </td>
      <td className="px-6 py-3">
        <div className="mb-1"><RiskBadge tag={riskTag} /></div>
        {hasCritical && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-danger-100 text-danger-500">
            {t('{n} critical', { n: redFlags.filter((f: any) => f.severity === 'CRITICAL').length })}
          </span>
        )}
        {!hasCritical && hasWarning && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-warn-100 text-warn-900">
            {redFlags.length > 1 ? t('{n} warnings', { n: redFlags.length }) : t('1 warning')}
          </span>
        )}
      </td>
      <td className="px-6 py-3 text-right">
        <Link
          href={`/consultation/${id}`}
          className="text-brand-500 hover:text-brand-900 text-xs font-medium"
        >
          {t('Review')}
        </Link>
      </td>
    </tr>
  );
}
