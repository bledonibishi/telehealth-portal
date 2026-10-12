'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { format } from 'date-fns';
import { MY_LAB_REPORTS, SUBMIT_MY_LAB_REPORT } from '@/graphql/portal';
import { openAuthedFile, uploadFile } from '@/lib/upload';
import { Card, CardHeader, btnOutline, btnPrimary } from '@/components/portal/Card';
import { InlineError } from '@/components/common/Alert';

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Received — your care team will add the results', cls: 'bg-amber-50 text-amber-700' },
  ENTERED: { label: 'Added to your results', cls: 'bg-emerald-50 text-emerald-700' },
  REJECTED: { label: 'We couldn’t use this one', cls: 'bg-slate-100 text-slate-600' },
};

/** Lets a patient send in a lab report (PDF or photo) for their care team to read and add to their results. */
export function LabReportCard() {
  const { data } = useQuery(MY_LAB_REPORTS, { fetchPolicy: 'cache-and-network' });
  const [submit] = useMutation(SUBMIT_MY_LAB_REPORT, { refetchQueries: [{ query: MY_LAB_REPORTS }], awaitRefetchQueries: true });
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const reports: any[] = data?.myLabReports ?? [];

  const send = async () => {
    if (!file) return;
    setError(null);
    setSent(false);
    setBusy(true);
    try {
      const fileId = await uploadFile('LAB_REPORT', file);
      await submit({ variables: { input: { fileId, note: note.trim() || undefined } } });
      setFile(null);
      setNote('');
      if (input.current) input.current.value = '';
      setSent(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const open = async (r: { id: string; fileUrl: string }) => {
    setError(null);
    setOpening(r.id);
    try {
      await openAuthedFile(r.fileUrl);
    } catch (e) {
      setError(e);
    } finally {
      setOpening(null);
    }
  };

  return (
    <Card>
      <CardHeader title="Send us a lab report" subtitle="Had a blood test? Send the report and your care team will add the results." />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => input.current?.click()} className={btnOutline}>{file ? 'Choose a different file' : 'Choose a file'}</button>
          <span className="text-sm text-slate-600 truncate">{file ? file.name : 'A PDF or a clear photo, up to 15 MB'}</span>
          <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setSent(false); }} />
        </div>
        {file && (
          <label className="block">
            <span className="block text-xs text-slate-500 mb-1">Anything your care team should know? (optional)</span>
            <textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink-500" />
          </label>
        )}
        <div className="flex items-center gap-3">
          <button type="button" onClick={send} disabled={!file || busy} className={btnPrimary}>{busy ? 'Sending…' : 'Send the report'}</button>
          {sent && <span className="text-sm text-emerald-700" role="status">Sent. Your care team will add the results.</span>}
        </div>
        <InlineError error={error} />
        <p className="text-xs text-slate-500">Only you and your doctors can see it. Your care team reads it and may use an automated reading tool to help, and they check every value themselves.</p>
      </div>

      {reports.length > 0 && (
        <ul className="divide-y divide-slate-100 mt-4 border-t border-slate-100">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-900 truncate">{r.filename}</p>
                <p className="text-xs text-slate-500">Sent {format(new Date(r.createdAt), 'd MMM yyyy')}{r.status === 'REJECTED' && r.note ? ` · ${r.note}` : ''}</p>
              </div>
              <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${STATUS[r.status]?.cls ?? 'bg-slate-100 text-slate-600'}`}>{STATUS[r.status]?.label ?? r.status}</span>
              <button type="button" onClick={() => open(r)} disabled={opening === r.id} className="text-xs font-semibold text-ink-600 hover:text-ink-800 border border-slate-200 rounded-lg px-3 py-1.5 disabled:opacity-50">
                {opening === r.id ? 'Opening…' : 'Open'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
