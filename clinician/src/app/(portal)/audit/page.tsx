'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@apollo/client';
import { endOfDay, startOfDay } from 'date-fns';
import { GET_AUDIT_LOG } from '@/graphql/audit';
import ExportCsvButton from '@/components/ExportCsvButton';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { hasAccess } from '@/lib/role';
import type { CsvColumn } from '@/lib/csv';
import { InlineError } from '@/components/ui/Alert';
import { LoadingState } from '@telehealth/loading';
import { BusyLabel } from '@telehealth/loading';

const PAGE_SIZE = 50;

const inputCls = 'border border-[color:var(--border)] rounded-lg px-2.5 py-1.5 text-xs text-[color:var(--t-body)] bg-[color:var(--bg-card)] placeholder:text-[color:var(--t-dim)] focus:outline-none focus:ring-2 focus:ring-sky-500';

type Entry = {
  id: string; timestamp: string; actorId: string; actorName: string | null; actorRole: string; action: string;
  resourceType: string; resourceId: string; patientId: string | null; patientName: string | null; metadata: string | null;
};

// What changed, as short "key: value" text. The stored JSON is the full record; this is only for scanning.
function summarise(metadata: string | null): string {
  if (!metadata) return '';
  try {
    const parsed = JSON.parse(metadata);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.entries(parsed).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ');
    }
  } catch { /* fall through to the raw text */ }
  return metadata;
}

function AuditLog() {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const patientId = params.get('patient') ?? '';

  // What is typed, versus what is searched: results only change on Apply, not on every key.
  const [draft, setDraft] = useState({ action: '', from: '', to: '' });
  const [applied, setApplied] = useState(draft);
  const [loadingMore, setLoadingMore] = useState(false);

  const filter = useMemo(() => ({
    limit: PAGE_SIZE,
    ...(applied.action.trim() ? { action: applied.action.trim() } : {}),
    ...(patientId ? { patientId } : {}),
    // A date input gives a calendar day: from the start of it, up to and including the end of the other.
    ...(applied.from ? { from: startOfDay(new Date(`${applied.from}T00:00`)).toISOString() } : {}),
    ...(applied.to ? { to: new Date(endOfDay(new Date(`${applied.to}T00:00`)).getTime() + 1).toISOString() } : {}),
  }), [applied, patientId]);

  const { data, loading, error, fetchMore } = useQuery(GET_AUDIT_LOG, { variables: { filter }, fetchPolicy: 'cache-and-network' });
  const entries: Entry[] = data?.auditLog.entries ?? [];
  const nextCursor: string | null = data?.auditLog.nextCursor ?? null;

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      await fetchMore({
        variables: { filter: { ...filter, cursor: nextCursor } },
        updateQuery: (prev, { fetchMoreResult }) => fetchMoreResult && ({
          auditLog: { ...fetchMoreResult.auditLog, entries: [...prev.auditLog.entries, ...fetchMoreResult.auditLog.entries] },
        }),
      });
    } finally {
      setLoadingMore(false);
    }
  };

  const columns: CsvColumn<Entry>[] = [
    { header: 'Time', value: (e) => e.timestamp },
    { header: 'Who', value: (e) => e.actorName ?? e.actorId },
    { header: 'Role', value: (e) => e.actorRole },
    { header: 'Action', value: (e) => e.action },
    { header: 'Record', value: (e) => `${e.resourceType} ${e.resourceId}` },
    { header: 'Patient', value: (e) => e.patientName ?? e.patientId },
    { header: 'Details', value: (e) => summarise(e.metadata) },
  ];

  return (
    <div className="p-5 md:p-8 space-y-4 text-[color:var(--t-body)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-wide text-[color:var(--t-strong)] uppercase">{t('Audit log')}</h1>
          <p className="text-xs text-[color:var(--t-dim)] mt-0.5">{t('Who opened or changed what, and when. Entries can never be edited or deleted.')}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <ExportCsvButton resource="audit-log" rows={entries} columns={columns} />
          {nextCursor && <p className="text-[11px] text-amber-600">{t('The CSV has only the {n} entries loaded. Load more first for the rest.', { n: entries.length })}</p>}
        </div>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); setApplied(draft); }}
      >
        <input
          type="text"
          value={draft.action}
          onChange={(e) => setDraft({ ...draft, action: e.target.value })}
          placeholder={t('Action, e.g. ORDER or LOGIN')}
          className={`${inputCls} w-56`}
        />
        <label className="flex items-center gap-1.5 text-xs text-[color:var(--t-muted)]">
          {t('From')}
          <input type="date" value={draft.from} max={draft.to || undefined} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className={inputCls} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-[color:var(--t-muted)]">
          {t('To')}
          <input type="date" value={draft.to} min={draft.from || undefined} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className={inputCls} />
        </label>
        <button type="submit" className="px-3 py-1.5 text-xs font-medium rounded-lg bg-sky-500 text-white hover:bg-sky-400">{t('Apply')}</button>
        {patientId && (
          <button
            type="button"
            onClick={() => router.replace('/audit')}
            className="px-2.5 py-1 text-xs rounded-full bg-sky-500/15 text-sky-300 hover:bg-sky-500/25"
          >
            {t('One patient only')} ✕
          </button>
        )}
      </form>

      <InlineError error={error} />

      <div className="overflow-x-auto rounded-md border border-[color:var(--border)] bg-[color:var(--bg-card)]">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[color:var(--t-muted)] border-b border-[color:var(--border)]">
              <th className="px-4 py-3 font-medium whitespace-nowrap">{t('Time')}</th>
              <th className="px-4 py-3 font-medium">{t('Who')}</th>
              <th className="px-4 py-3 font-medium">{t('Action')}</th>
              <th className="px-4 py-3 font-medium">{t('Record')}</th>
              <th className="px-4 py-3 font-medium">{t('Patient')}</th>
              <th className="px-4 py-3 font-medium">{t('Details')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--border-subtle)]">
            {entries.map((e) => {
              const details = summarise(e.metadata);
              return (
                <tr key={e.id} className="align-top">
                  <td className="px-4 py-2.5 whitespace-nowrap text-[color:var(--t-muted)]">{fmt(e.timestamp, 'd MMM yyyy HH:mm:ss')}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-[color:var(--t-strong)]">{e.actorName ?? e.actorId}</span>
                    <span className="ml-1.5 text-[10px] uppercase text-[color:var(--t-dim)]">{e.actorRole}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-[color:var(--t-strong)]">{e.action}</td>
                  <td className="px-4 py-2.5 text-[color:var(--t-muted)]">{e.resourceType} <span className="font-mono text-[10px] text-[color:var(--t-dim)]">{e.resourceId}</span></td>
                  <td className="px-4 py-2.5">
                    {e.patientId ? (
                      <Link href={`/patients?patient=${e.patientId}`} className="text-sky-400 hover:underline">{e.patientName ?? e.patientId}</Link>
                    ) : <span className="text-[color:var(--t-dim)]">—</span>}
                  </td>
                  <td className="px-4 py-2.5 max-w-xs truncate text-[color:var(--t-muted)]" title={details}>{details}</td>
                </tr>
              );
            })}
            {!loading && entries.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-[color:var(--t-dim)]">{t('No entries match.')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {loading && !data && <LoadingState variant="inline" label={t('Loading…')} />}
      {nextCursor && (
        <button onClick={loadMore} disabled={loadingMore} className={`${inputCls} hover:border-[color:var(--border-strong)] disabled:opacity-50`}>
          <BusyLabel busy={loadingMore} busyText={t('Loading…')}>{t('Load more')}</BusyLabel>
        </button>
      )}
    </div>
  );
}

export default function AuditPage() {
  const { t } = useI18n();
  // The menu hides this page from other roles, but the address still works: the backend refuses them too.
  if (!hasAccess(['ADMIN'])) return <p className="p-6 text-sm text-[color:var(--t-dim)]">{t('Only admins can see the audit log.')}</p>;
  return <Suspense fallback={null}><AuditLog /></Suspense>;
}
