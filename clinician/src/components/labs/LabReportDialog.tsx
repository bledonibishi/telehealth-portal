'use client';

import { useRef, useState } from 'react';
import { useMutation } from '@apollo/client';
import { format } from 'date-fns';
import { Dialog } from '@/components/ui/Dialog';
import { InlineError } from '@/components/ui/Alert';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { openAuthedDocument } from '@/lib/documents';
import { uploadLabReport } from '@/lib/lab-reports';
import { PATIENT_LAB_REPORTS, PATIENT_LAB_RESULTS, PATIENT_TRT_MONITORING, READ_LAB_REPORT, RECORD_LAB_RESULTS, REJECT_LAB_REPORT } from '@/graphql/labs';
import { DEFAULT_UNIT, KIND_LABEL, suggestedRange, type LabReport } from './labs-format';

type Row = {
  key: number;
  include: boolean;
  kind: string;
  analyteName: string;
  value: string;
  unit: string;
  low: string;
  high: string;
  date: string;
  flaggedByLab?: boolean | null;
  alreadyRecorded?: boolean;
  fromReader?: boolean;
};

type Reading = {
  status: string;
  reason?: string | null;
  patientNameOnReport?: string | null;
  nameMatches?: boolean | null;
  labName?: string | null;
  reportDate?: string | null;
  notes: string;
  warnings: string[];
  results: Array<{ kind: string; analyteName?: string | null; value: number; unit: string; referenceLow?: number | null; referenceHigh?: number | null; collectedOn?: string | null; flaggedByLab?: boolean | null; alreadyRecorded: boolean }>;
};

const cell = 'border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full';
let nextKey = 1;
const blankRow = (): Row => ({ key: nextKey++, include: true, kind: 'ESTRADIOL', analyteName: '', value: '', unit: DEFAULT_UNIT.ESTRADIOL ?? '', low: '', high: '', date: format(new Date(), 'yyyy-MM-dd') });
const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

/**
 * Enter the results on a lab report. The report is attached to the patient's record (a doctor's upload, or one the
 * patient sent in), the doctor may have an AI reader list its values, and every row is theirs to correct before
 * anything is saved: nothing the reader finds goes on the record by itself.
 */
export default function LabReportDialog({
  patientId, patientName, gender, report: initial, onClose,
}: {
  patientId: string;
  patientName: string;
  gender?: string | null;
  /** A report already on the record (one the patient sent in); without one the dialog starts with choosing a file. */
  report?: LabReport | null;
  onClose: () => void;
}) {
  const { t, fmt } = useI18n();
  const [report, setReport] = useState<LabReport | null>(initial ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => (initial ? [blankRow()] : []));
  const [reading, setReading] = useState<Reading | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const refetch = [
    { query: PATIENT_LAB_RESULTS, variables: { patientId } },
    { query: PATIENT_LAB_REPORTS, variables: { patientId } },
    { query: PATIENT_TRT_MONITORING, variables: { patientId } },
  ];
  const [readReport, { loading: readingNow }] = useMutation(READ_LAB_REPORT, { onError: setError });
  const [save, { loading: saving }] = useMutation(RECORD_LAB_RESULTS, { refetchQueries: refetch, awaitRefetchQueries: true, onError: setError });
  const [reject, { loading: rejectingNow }] = useMutation(REJECT_LAB_REPORT, { refetchQueries: refetch, onCompleted: onClose, onError: setError });

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const chooseKind = (r: Row, kind: string) => update(r.key, { kind, unit: !r.unit || r.unit === DEFAULT_UNIT[r.kind] ? DEFAULT_UNIT[kind] ?? r.unit : r.unit });

  const upload = async () => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const saved = await uploadLabReport(patientId, file, note);
      setReport({ id: saved.id, patientId, source: 'STAFF', status: 'PENDING', note: note.trim() || null, filename: saved.filename, mimeType: file.type, fileUrl: saved.fileUrl, createdAt: new Date().toISOString(), resultCount: 0 });
      setRows([blankRow()]);
    } catch (e) {
      setError(e);
    } finally {
      setUploading(false);
    }
  };

  const read = async () => {
    if (!report) return;
    setError(null);
    setProblems([]);
    const { data } = await readReport({ variables: { reportId: report.id } });
    const out: Reading | undefined = data?.readLabReport;
    if (!out) return;
    setReading(out);
    if (out.status !== 'COMPLETED' || !out.results.length) return;
    // What was read replaces the empty starting row, never rows the doctor already filled in.
    setRows((rs) => [
      ...rs.filter((r) => r.value.trim() !== ''),
      ...out.results.map((x): Row => ({
        key: nextKey++,
        include: !x.alreadyRecorded,
        kind: x.kind,
        analyteName: x.analyteName ?? '',
        value: String(x.value),
        unit: x.unit,
        low: x.referenceLow != null ? String(x.referenceLow) : '',
        high: x.referenceHigh != null ? String(x.referenceHigh) : '',
        date: x.collectedOn ?? '',
        flaggedByLab: x.flaggedByLab,
        alreadyRecorded: x.alreadyRecorded,
        fromReader: true,
      })),
    ]);
  };

  const chosen = rows.filter((r) => r.include && r.value.trim() !== '');
  const submit = async () => {
    if (!report) return;
    const bad: string[] = [];
    chosen.forEach((r, i) => {
      const label = r.kind === 'OTHER' ? r.analyteName || t('Other') : t(KIND_LABEL[r.kind] ?? r.kind);
      if (!Number.isFinite(Number(r.value))) bad.push(t('{test}: the value isn’t a number.', { test: label }));
      if (!r.unit.trim()) bad.push(t('{test}: enter the unit.', { test: label }));
      if (!r.date) bad.push(t('{test}: enter the date the sample was taken.', { test: label }));
      if (r.kind === 'OTHER' && !r.analyteName.trim()) bad.push(t('Result {n}: name the test.', { n: i + 1 }));
      if (r.low.trim() !== '' && r.high.trim() !== '' && Number(r.low) > Number(r.high)) bad.push(t('{test}: the low end of the range is above the high end.', { test: label }));
    });
    setProblems(bad);
    if (bad.length || chosen.length === 0) return;
    setError(null);
    const { errors } = await save({
      variables: {
        input: {
          patientId,
          reportId: report.id,
          results: chosen.map((r) => ({
            kind: r.kind,
            analyteName: r.kind === 'OTHER' ? r.analyteName.trim() : undefined,
            value: Number(r.value),
            unit: r.unit.trim(),
            referenceRangeLow: num(r.low),
            referenceRangeHigh: num(r.high),
            collectedAt: new Date(`${r.date}T09:00:00`).toISOString(),
          })),
        },
      },
    });
    if (!errors) onClose();
  };

  return (
    <Dialog wide title={t('Add results from a lab report')} subtitle={patientName} onClose={onClose}>
      {!report ? (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
            <p className="text-sm text-gray-600">{t('Attach the lab’s report (a PDF or a photo). It stays on the patient’s record, and the results you enter from it point back to it.')}</p>
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-gray-300 hover:border-brand-500 py-10 text-center transition-colors"
            >
              <span className="block text-sm font-medium text-gray-800">{file ? file.name : t('Choose a file')}</span>
              <span className="block text-xs text-gray-400 mt-1">{file ? `${Math.max(1, Math.round(file.size / 1024))} KB` : t('PDF, JPEG, PNG or WebP, up to 15 MB')}</span>
            </button>
            <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <label className="block">
              <span className="block text-xs text-gray-500 mb-1">{t('Note (optional)')}</span>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={cell} />
            </label>
            <InlineError error={error} />
          </div>
          <div className="flex items-center gap-2 border-t border-gray-200 bg-gray-50 px-6 py-4 rounded-b-xl">
            <button type="button" onClick={upload} disabled={!file || uploading} className="bg-brand-500 hover:bg-brand-900 text-white rounded-lg px-5 h-10 text-sm font-medium disabled:opacity-50">
              {uploading ? t('Uploading…') : t('Upload and continue')}
            </button>
            <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 h-10">{t('Cancel')}</button>
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{report.filename}</p>
                <p className="text-xs text-gray-500">
                  {report.source === 'PATIENT' ? t('Sent by the patient') : t('Attached by the care team')} · {fmt(report.createdAt, 'd MMM yyyy')}
                </p>
                {report.note && <p className="text-xs text-gray-600 mt-1">“{report.note}”</p>}
              </div>
              <button type="button" onClick={() => openAuthedDocument(report.fileUrl, t)} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-brand-500 hover:bg-gray-50">{t('Open report')}</button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={read} disabled={readingNow} className="text-sm font-medium px-4 h-9 rounded-lg bg-brand-500 text-white hover:bg-brand-900 disabled:opacity-50">
                {readingNow ? t('Reading the report…') : reading ? t('Read it again') : t('Read with AI')}
              </button>
              <button type="button" onClick={() => setRows((rs) => [...rs, blankRow()])} className="text-sm font-medium px-4 h-9 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">{t('+ Add a result')}</button>
              <span className="text-xs text-gray-400">{t('The AI only suggests values. You check each one against the report before anything is saved.')}</span>
            </div>

            {reading && reading.status !== 'COMPLETED' && (
              <p className="text-sm rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3">
                {reading.reason ? t(reading.reason) : t('The report couldn’t be read.')} {t('Enter the results by hand below.')}
              </p>
            )}
            {reading?.status === 'COMPLETED' && (
              <div className="space-y-2">
                {reading.nameMatches === false && (
                  <p className="text-sm rounded-lg bg-red-50 border border-red-200 text-red-800 px-4 py-3 font-medium">
                    {t('The name on this report (“{name}”) isn’t this patient’s. Check it is the right report before saving anything.', { name: reading.patientNameOnReport ?? '' })}
                  </p>
                )}
                {reading.nameMatches === true && <p className="text-xs text-green-700">✓ {t('The name on the report matches the patient.')}{reading.labName ? ` · ${reading.labName}` : ''}</p>}
                {reading.warnings.filter((w) => !/isn’t this patient’s|is not this patient’s/.test(w)).map((w) => (
                  <p key={w} className="text-xs text-amber-800">⚠ {t(w)}</p>
                ))}
                {reading.notes && <p className="text-xs text-gray-500">{t('Reader’s note')}: {reading.notes}</p>}
              </div>
            )}

            <div className="space-y-2">
              {rows.length > 0 && (
                <div className="hidden lg:grid grid-cols-[1.5rem_9rem_1fr_6rem_6rem_6rem_9rem_1.5rem] gap-2 text-xs text-gray-400 px-1">
                  <span /> <span>{t('Test')}</span> <span>{t('Value')}</span> <span>{t('Unit')}</span> <span>{t('Range low')}</span> <span>{t('Range high')}</span> <span>{t('Date taken')}</span> <span />
                </div>
              )}
              {rows.map((r) => {
                const suggestion = r.low.trim() === '' && r.high.trim() === '' ? suggestedRange(r.kind, gender) : null;
                return (
                  <div key={r.key} className={`rounded-lg border p-2 ${r.include ? 'border-gray-200' : 'border-dashed border-gray-200 opacity-60'} ${r.alreadyRecorded ? 'bg-gray-50' : ''}`}>
                    <div className="grid grid-cols-2 lg:grid-cols-[1.5rem_9rem_1fr_6rem_6rem_6rem_9rem_1.5rem] gap-2 items-center">
                      <input type="checkbox" checked={r.include} onChange={(e) => update(r.key, { include: e.target.checked })} aria-label={t('Save this result')} className="justify-self-center" />
                      <select value={r.kind} onChange={(e) => chooseKind(r, e.target.value)} className={cell} aria-label={t('Test')}>
                        {Object.entries(KIND_LABEL).map(([k, label]) => <option key={k} value={k}>{t(label)}</option>)}
                      </select>
                      <input value={r.value} onChange={(e) => update(r.key, { value: e.target.value })} inputMode="decimal" placeholder={t('Value')} className={cell} aria-label={t('Value')} />
                      <input value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value })} placeholder={t('Unit')} className={cell} aria-label={t('Unit')} />
                      <input value={r.low} onChange={(e) => update(r.key, { low: e.target.value })} inputMode="decimal" placeholder={t('Low')} className={cell} aria-label={t('Range low')} />
                      <input value={r.high} onChange={(e) => update(r.key, { high: e.target.value })} inputMode="decimal" placeholder={t('High')} className={cell} aria-label={t('Range high')} />
                      <input type="date" value={r.date} onChange={(e) => update(r.key, { date: e.target.value })} className={`${cell} ${r.date ? '' : 'border-amber-400'}`} aria-label={t('Date taken')} />
                      <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={t('Remove')} className="text-gray-400 hover:text-danger-500 justify-self-center">✕</button>
                    </div>
                    {r.kind === 'OTHER' && (
                      <input value={r.analyteName} onChange={(e) => update(r.key, { analyteName: e.target.value })} placeholder={t('Name of the test, e.g. Vitamin D')} className={`${cell} mt-2`} aria-label={t('Name of the test')} />
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 px-1 text-xs">
                      {r.alreadyRecorded && <span className="text-gray-500">{t('Already on the record')}</span>}
                      {r.fromReader && <span className="text-blue-700">{t('Read from the report')}</span>}
                      {r.flaggedByLab && <span className="text-amber-700">{t('The lab marked this result')}</span>}
                      {suggestion && (
                        <button type="button" onClick={() => update(r.key, { low: suggestion.low != null ? String(suggestion.low) : '', high: suggestion.high != null ? String(suggestion.high) : '', unit: r.unit || suggestion.unit })} className="text-brand-500 hover:underline">
                          {t('No range on the report? Use a typical one ({range}, {who})', { range: `${suggestion.low ?? ''}–${suggestion.high ?? ''}`, who: t(suggestion.note) })}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {problems.length > 0 && (
              <ul className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 space-y-0.5">
                {problems.map((p) => <li key={p} className="text-xs text-red-700">{p}</li>)}
              </ul>
            )}
            <InlineError error={error} />

            {report.status === 'PENDING' && (
              <div className="border-t border-dashed border-gray-200 pt-3">
                {rejecting ? (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">{t('Why can’t this report be used? The patient will see this.')}</p>
                    <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('e.g. The photo is too blurry to read')} className={cell} />
                    <div className="flex gap-2">
                      <button type="button" disabled={rejectingNow} onClick={() => reject({ variables: { input: { reportId: report.id, reason: reason.trim() || undefined } } })} className="text-xs px-3 py-1.5 rounded-lg bg-danger-500 text-white disabled:opacity-50">{t('Reject the report')}</button>
                      <button type="button" onClick={() => setRejecting(false)} className="text-xs text-gray-500 px-2">{t('Keep')}</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setRejecting(true)} className="text-xs text-gray-400 hover:text-danger-500">{t('This report can’t be used')}</button>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-gray-200 bg-gray-50 px-6 py-4 rounded-b-xl">
            <button type="button" onClick={submit} disabled={saving || chosen.length === 0} className="bg-green-600 hover:bg-green-700 text-white rounded-lg px-5 h-10 text-sm font-medium disabled:opacity-50">
              {saving ? t('Saving…') : chosen.length === 1 ? t('Save 1 result') : t('Save {n} results', { n: chosen.length })}
            </button>
            <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 h-10">{t('Cancel')}</button>
          </div>
        </>
      )}
    </Dialog>
  );
}
