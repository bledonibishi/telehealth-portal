'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { RiskBadge } from '@/components/consultation/RiskBadge';

// Each status is a neutral pill with a coloured dot, so a column of them reads calmly and the dot carries the meaning.
const STATUS_LABELS: Record<string, { label: string; dot: string }> = {
  SUBMITTED: { label: 'New', dot: 'bg-sky-500' },
  IN_REVIEW: { label: 'In review', dot: 'bg-amber-500' },
  MORE_INFO_REQUESTED: { label: 'Awaiting info', dot: 'bg-orange-500' },
  APPROVED: { label: 'Approved', dot: 'bg-green-500' },
  DECLINED: { label: 'Declined', dot: 'bg-gray-400' },
};

/** Opens the consultation from anywhere on the row: click, Enter, or Cmd/Ctrl-click for a new tab. */
export function QueueRow({ consultation }: { consultation: any }) {
  const { t, timeAgo, fmt } = useI18n();
  const router = useRouter();
  const { id, patient, kind, status, submittedAt, redFlags, clinician, riskTag, decisionBlockedReason } = consultation;
  const critical = redFlags.filter((f: any) => f.severity === 'CRITICAL').length;
  const hasWarning = redFlags.some((f: any) => f.severity === 'WARNING');
  const badge = STATUS_LABELS[status] ?? { label: status, dot: 'bg-gray-400' };
  const href = `/consultation/${id}`;
  const initials = `${patient.firstName?.[0] ?? ''}${patient.lastName?.[0] ?? ''}`.toUpperCase() || '?';

  const open = (newTab: boolean) => (newTab ? window.open(href, '_blank', 'noopener') : router.push(href));

  return (
    <tr
      onClick={(e) => open(e.metaKey || e.ctrlKey)}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) open(e.metaKey || e.ctrlKey); }}
      tabIndex={0}
      className={`group cursor-pointer transition-colors hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${critical ? 'bg-red-50/60' : ''}`}
    >
      {/* A red bar down the edge marks a critical red flag. */}
      <td className={`pl-4 pr-3 py-3 w-0 ${critical ? 'shadow-[inset_3px_0_0_theme(colors.red.500)]' : ''}`}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600" aria-hidden>{initials}</span>
      </td>
      <td className="px-3 py-3 min-w-[14rem]">
        <Link href={href} onClick={(e) => e.stopPropagation()} className="block text-[13px] font-medium text-gray-900 hover:underline focus:outline-none">
          {patient.firstName} {patient.lastName}
        </Link>
        <span className="block text-xs text-gray-500 truncate max-w-[18rem]">{patient.email}</span>
      </td>
      <td className="px-3 py-3">
        <span className="inline-flex rounded-md border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-gray-600">{kind}</span>
      </td>
      <td className="px-3 py-3 max-w-[22rem]">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-700">
          <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} aria-hidden />
          {t(badge.label)}
        </span>
        {status === 'IN_REVIEW' && clinician && (
          <span className="ml-2 text-xs text-gray-500">{t('Dr {name}', { name: clinician.lastName })}</span>
        )}
        {decisionBlockedReason && (
          <span className="mt-1 flex items-start gap-1 text-xs text-warn-900" title={t(decisionBlockedReason)}>
            <svg viewBox="0 0 20 20" className="mt-0.5 h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10" cy="10" r="7.5" /><path d="M10 6.5v4M10 13.5h.01" strokeLinecap="round" /></svg>
            <span className="line-clamp-2">{t(decisionBlockedReason)}</span>
          </span>
        )}
      </td>
      <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500" title={fmt(submittedAt, 'PPp')}>
        {timeAgo(submittedAt)}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <RiskBadge tag={riskTag} />
          {critical > 0 && (
            <span className="inline-flex items-center rounded-full bg-danger-100 px-2 py-0.5 text-xs font-medium text-danger-500">{t('{n} critical', { n: critical })}</span>
          )}
          {!critical && hasWarning && (
            <span className="inline-flex items-center rounded-full bg-warn-100 px-2 py-0.5 text-xs font-medium text-warn-900">
              {redFlags.length > 1 ? t('{n} warnings', { n: redFlags.length }) : t('1 warning')}
            </span>
          )}
        </div>
      </td>
      <td className="pl-3 pr-4 py-3 text-right">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 group-hover:text-brand-500 transition-colors">
          {t('Review')}
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M7 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </td>
    </tr>
  );
}
