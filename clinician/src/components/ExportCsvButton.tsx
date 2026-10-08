'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { format } from 'date-fns';
import { RECORD_DATA_EXPORT } from '@/graphql/audit';
import { hasAccess } from '@/lib/role';
import { downloadCsv, toCsv, type CsvColumn } from '@/lib/csv';
import { useI18n } from '@/lib/i18n/I18nProvider';

/**
 * Downloads the rows on screen as a CSV (opens in Excel). Admins only, and each export is
 * reported to the audit log first: if that fails, nothing is downloaded.
 */
export default function ExportCsvButton<T>({ resource, rows, columns, className = '' }: {
  /** Names the table in the audit log and the file, e.g. "patients". Must be one the backend allows. */
  resource: string;
  rows: T[];
  columns: CsvColumn<T>[];
  className?: string;
}) {
  const { t } = useI18n();
  const [record, { loading }] = useMutation(RECORD_DATA_EXPORT);
  const [failed, setFailed] = useState(false);

  if (!hasAccess(['ADMIN'])) return null;

  const run = async () => {
    setFailed(false);
    try {
      await record({ variables: { input: { resource, rowCount: rows.length } } });
    } catch {
      setFailed(true);
      return;
    }
    downloadCsv(`${resource}-${format(new Date(), 'yyyy-MM-dd')}.csv`, toCsv(rows, columns));
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={loading || rows.length === 0}
        title={rows.length === 0 ? t('Nothing to export') : undefined}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-card)] text-[color:var(--t-body)] hover:border-[color:var(--border-strong)] disabled:opacity-50 ${className}`}
      >
        {loading ? t('Exporting…') : t('Export CSV')}
      </button>
      {failed && <span className="text-xs text-red-500">{t('Could not export')}</span>}
    </span>
  );
}
