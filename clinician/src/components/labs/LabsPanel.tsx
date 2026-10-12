'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { PATIENT_LAB_REPORTS, PATIENT_LAB_RESULTS, PATIENT_TRT_MONITORING } from '@/graphql/labs';
import { openAuthedDocument } from '@/lib/documents';
import { KIND_LABEL, groupResults, roundTo, type LabReport, type LabResult, type LabSeries, type TrtMonitoring } from './labs-format';
import LabReportDialog from './LabReportDialog';
import { TrtMonitoringCard } from './TrtMonitoringCard';
import { RecordLabResultForm } from './RecordLabResultForm';
import { LabTrendChart } from './LabTrendChart';
import { useI18n } from '@/lib/i18n/I18nProvider';

function rangeText(low?: number | null, high?: number | null) {
  if (low != null && high != null) return `${low}–${high}`;
  if (high != null) return `≤ ${high}`;
  if (low != null) return `≥ ${low}`;
  return null;
}

/** A patient's lab results: one card per test with its trend, the testosterone schedule (TRT only), and entry of new results. */
export default function LabsPanel({ patientId, canRecord, patientName = '', gender }: { patientId: string; canRecord: boolean; patientName?: string; gender?: string | null }) {
  const { t, fmt, timeAgo } = useI18n();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  // The dialog for entering results from a report: a new one (null report) or one already on the record.
  const [dialog, setDialog] = useState<{ report: LabReport | null } | null>(null);
  const { data } = useQuery(PATIENT_LAB_RESULTS, { variables: { patientId } });
  const { data: trtData } = useQuery(PATIENT_TRT_MONITORING, { variables: { patientId } });
  const { data: reportData } = useQuery(PATIENT_LAB_REPORTS, { variables: { patientId }, skip: !canRecord });
  const reports: LabReport[] = reportData?.patientLabReports ?? [];
  const waiting = reports.filter((r) => r.status === 'PENDING');
  const results: LabResult[] = data?.patientLabResults ?? [];
  const monitoring: TrtMonitoring | null = trtData?.patientTrtMonitoring ?? null;
  const series = groupResults(results);
  const attention = series.filter((s) => s.latest.flagged && !s.latest.reviewedAt);

  const nameOf = (s: LabSeries) => (s.kind === 'OTHER' ? s.name : t(KIND_LABEL[s.kind] ?? s.kind));

  const card = (s: LabSeries) => {
    const r = s.latest;
    const range = rangeText(r.referenceRangeLow, r.referenceRangeHigh);
    const delta = s.previous ? roundTo(r.value - s.previous.value) : null;
    const expanded = open === s.key;
    return (
      <div key={s.key} className={`rounded-xl border bg-white p-4 ${r.flagged && !r.reviewedAt ? 'border-danger-500/50' : 'border-gray-200'}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{nameOf(s)}</p>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className={`text-2xl font-semibold ${r.flagged ? 'text-danger-500' : 'text-gray-900'}`}>{r.value}</span>
              <span className="text-sm text-gray-500">{r.unit}</span>
              {delta != null && delta !== 0 && (
                <span className="text-xs text-gray-400" title={t('Change since the last result')}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta)}</span>
              )}
            </p>
          </div>
          {r.flagged && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${r.reviewedAt ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {r.reviewedAt ? t('Reviewed') : t('Out of range')}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {fmt(r.collectedAt, 'd MMM yyyy')} · {timeAgo(r.collectedAt)}
          {range && <> · {t('Reference range {range}', { range })}</>}
        </p>

        <div className="mt-3"><LabTrendChart points={s.points} /></div>
        {r.reviewNote && <p className="text-xs text-gray-500 mt-2">{t('Review:')} {r.reviewNote}</p>}

        {s.points.length > 1 && (
          <button type="button" onClick={() => setOpen(expanded ? null : s.key)} className="mt-3 text-xs font-medium text-brand-500 hover:text-brand-900">
            {expanded ? t('Hide history') : t('Show history ({n})', { n: s.points.length })}
          </button>
        )}
        {expanded && (
          <ul className="mt-2 divide-y divide-gray-100 border-t border-gray-100">
            {[...s.points].reverse().map((p) => (
              <li key={p.id} className="py-1.5 flex items-center justify-between text-xs">
                <span className={p.flagged ? 'text-danger-500 font-semibold' : 'text-gray-800 font-medium'}>{p.value} {p.unit}</span>
                <span className="text-gray-400">
                  {fmt(p.collectedAt, 'd MMM yyyy')}{p.enteredBy && ` · ${p.enteredBy.firstName} ${p.enteredBy.lastName[0]}.`}
                  {p.reportUrl && <> · <button type="button" onClick={() => openAuthedDocument(p.reportUrl!, t)} className="text-brand-500 hover:underline">{t('Report')}</button></>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="p-5 space-y-5">
      {monitoring && <TrtMonitoringCard monitoring={monitoring} />}

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">{t('Lab results')}</p>
          {results.length > 0 && <p className="text-xs text-gray-400 mt-0.5">{t('{n} results across {tests} tests', { n: results.length, tests: series.length })}</p>}
        </div>
        {canRecord && !adding && (
          <div className="flex items-center gap-2">
            <button onClick={() => setDialog({ report: null })} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-900">{t('+ Add from a report')}</button>
            <button onClick={() => setAdding(true)} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">{t('+ Record result')}</button>
          </div>
        )}
      </div>

      {waiting.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-2">
          <p className="text-sm font-semibold text-blue-900">{waiting.length === 1 ? t('1 lab report is waiting for its results') : t('{n} lab reports are waiting for their results', { n: waiting.length })}</p>
          {waiting.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-blue-100 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-gray-900 truncate">{r.filename}</p>
                <p className="text-xs text-gray-500">{r.source === 'PATIENT' ? t('Sent by the patient') : t('Attached by the care team')} · {fmt(r.createdAt, 'd MMM yyyy')}{r.note ? ` · “${r.note}”` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => openAuthedDocument(r.fileUrl, t)} className="text-xs text-brand-500 hover:underline">{t('Open')}</button>
                <button type="button" onClick={() => setDialog({ report: r })} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-900">{t('Enter results')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialog && <LabReportDialog patientId={patientId} patientName={patientName} gender={gender} report={dialog.report} onClose={() => setDialog(null)} />}

      {adding && <RecordLabResultForm patientId={patientId} gender={gender} onDone={() => setAdding(false)} />}

      {attention.length > 0 && (
        <div className="rounded-lg border border-danger-500/30 bg-danger-50/60 px-4 py-3">
          <p className="text-xs font-semibold text-danger-500">{t('Out of range and not reviewed yet')}</p>
          <p className="text-xs text-gray-700 mt-1">{attention.map((s) => `${nameOf(s)} ${s.latest.value} ${s.latest.unit}`).join(' · ')}</p>
        </div>
      )}

      {results.length === 0 && !adding ? (
        <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center">
          <p className="text-sm text-gray-500">{t('No lab results recorded yet.')}</p>
          <p className="text-xs text-gray-400 mt-1">{t('Add results from a lab report to follow them over time.')}</p>
          {canRecord && <button onClick={() => setAdding(true)} className="mt-4 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-brand-500 hover:bg-gray-50">{t('+ Record result')}</button>}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">{series.map(card)}</div>
      )}

      {reports.filter((r) => r.status !== 'PENDING').length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('Lab reports')}</p>
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {reports.filter((r) => r.status !== 'PENDING').map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="text-gray-900 truncate">{r.filename}</p>
                  <p className="text-xs text-gray-400">{r.source === 'PATIENT' ? t('Sent by the patient') : t('Attached by the care team')} · {fmt(r.createdAt, 'd MMM yyyy')}{r.status === 'REJECTED' && r.note ? ` · ${r.note}` : ''}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${r.status === 'ENTERED' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {r.status === 'ENTERED' ? t('{n} results entered', { n: r.resultCount }) : t('Not used')}
                  </span>
                  <button type="button" onClick={() => openAuthedDocument(r.fileUrl, t)} className="text-xs text-brand-500 hover:underline">{t('Open')}</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
