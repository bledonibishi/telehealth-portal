'use client';

import { Fragment, useState } from 'react';
import { useMutation } from '@apollo/client';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { openAuthedDocument } from '@/lib/documents';
import { hasAccess } from '@/lib/role';
import { GET_PATIENT } from '@/graphql/patients';
import { ISSUE_CHECK_IN_LINK, RESCHEDULE_CHECK_IN } from '@/graphql/checkins';
import { InlineError } from '@/components/ui/Alert';
import { CopyId } from '@/components/ui/CopyId';
import { SearchInput } from '@/components/ui/SearchInput';

const DAY = 86_400_000;
const OUTCOME_LABEL: Record<string, string> = {
  REPEAT: 'Repeat sent',
  NEW_PRESCRIPTION: 'New prescription issued',
  HOLD: 'Held this month',
  STOP: 'Treatment stopped',
};
const isDev = process.env.NODE_ENV !== 'production';

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** The patient's check-ins: what is next and why, the link to hand over, and what each earlier one decided. */
export default function CheckInTab({ patient: p, orders, prescriptions = [], onOpenPrescriptions }: { patient: any; orders: any[]; prescriptions?: any[]; onOpenPrescriptions?: () => void }) {
  const { t, timeAgo, fmt } = useI18n();
  const [error, setError] = useState<unknown>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [showAnswers, setShowAnswers] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const canHandOver = hasAccess(['ADMIN', 'DOCTOR', 'CX_TEAM']);
  const canEditDate = isDev && hasAccess(['ADMIN', 'DOCTOR']);

  const refetch = { refetchQueries: [{ query: GET_PATIENT, variables: { id: p.id } }], onError: setError };
  const [issueLink, { loading: issuing }] = useMutation(ISSUE_CHECK_IN_LINK, refetch);
  const [reschedule, { loading: rescheduling }] = useMutation(RESCHEDULE_CHECK_IN, refetch);

  const all: any[] = [...(p.checkIns ?? [])].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const number = new Map(all.map((c, i) => [c.id, i + 1]));
  const current = prescriptions.filter((x) => x.status === 'ACTIVE').sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())[0];
  // Matches the check-in's own id (full or the short "#x2xval74"), or the prescription it reviews, was held on, or led to.
  const q = query.trim().toLowerCase().replace(/^#/, '');
  const has = (v?: string | null) => !!v && v.toLowerCase().includes(q);
  const shown = !q
    ? all
    : all.filter((c) => has(c.id) || has(c.prescription?.id) || has(c.resultPrescriptionId) || (c.status !== 'COMPLETED' && has(current?.id)));
  const open = shown.filter((c) => c.status !== 'COMPLETED').reverse();
  const done = shown.filter((c) => c.status === 'COMPLETED').reverse();
  const firstDispatch = orders
    .filter((o) => o.dispatchedAt)
    .map((o) => new Date(o.dispatchedAt))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const why = (c: any) => {
    const i = all.findIndex((x) => x.id === c.id);
    const prev = i > 0 ? all[i - 1] : null;
    const base = prev?.completedAt ? new Date(prev.completedAt) : !prev ? firstDispatch : null;
    if (!base) return null;
    const days = Math.round((new Date(c.dueAt).getTime() - base.getTime()) / DAY);
    return prev
      ? t('{n} days after the previous check-in was completed on {date}.', { n: days, date: fmt(base, 'dd MMM yyyy') })
      : t('{n} days after the first order was dispatched on {date}.', { n: days, date: fmt(base, 'dd MMM yyyy') });
  };

  const rxById = new Map(prescriptions.map((x) => [x.id, x]));
  const rxLink = (label: string, rx: any) => (
    <p className="text-xs text-gray-600">
      {label}{' '}
      <button type="button" onClick={onOpenPrescriptions} className="font-medium text-brand-500 hover:underline">{rx.medication}</button>
      <span className="text-gray-400 font-mono"> #{rx.id.slice(-8)}</span>
    </p>
  );

  const copy = (c: any) => {
    navigator.clipboard.writeText(c.checkInUrl);
    setCopiedId(c.id);
    setTimeout(() => setCopiedId((cur) => (cur === c.id ? null : cur)), 2000);
  };

  const step = (label: string, state: 'done' | 'current' | 'overdue' | 'todo', at?: string | null) => (
    <li key={label}>
      <div className={`h-1.5 rounded-full ${state === 'done' ? 'bg-green-500' : state === 'current' ? 'bg-blue-400' : state === 'overdue' ? 'bg-red-400' : 'bg-gray-200'}`} />
      <p className={`text-xs mt-1.5 ${state === 'todo' ? 'text-gray-400' : 'font-medium text-gray-800'}`}>{label}</p>
      <p className="text-xs text-gray-400">{at ? fmt(at, 'dd MMM') : '—'}</p>
    </li>
  );

  const linkPanel = (c: any) => {
    const live = c.status === 'SENT' && c.checkInUrl && c.tokenExpiresAt && new Date(c.tokenExpiresAt) > new Date();
    const expired = c.status === 'SENT' && !live;
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3.5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs font-semibold text-gray-700">{t('Patient link')}</p>
          {live && <p className="text-xs text-gray-400">{t('Expires {date}', { date: `${fmt(c.tokenExpiresAt, 'dd MMM yyyy')} (${timeAgo(c.tokenExpiresAt)})` })}</p>}
        </div>

        {live ? (
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={c.checkInUrl}
              onClick={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 bg-white font-mono"
            />
            <button onClick={() => copy(c)} className="shrink-0 text-xs px-3 py-1.5 border border-gray-200 rounded-lg bg-white hover:bg-gray-100 text-gray-700">
              {copiedId === c.id ? t('Copied!') : t('Copy')}
            </button>
            <a href={c.checkInUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs px-3 py-1.5 border border-gray-200 rounded-lg bg-white hover:bg-gray-100 text-gray-700">
              {t('Open')}
            </a>
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            {expired ? t('The link has expired. Create a new one.') : t('Not created yet. It is created and emailed automatically on the scheduled date.')}
          </p>
        )}

        {canHandOver && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {!live && (
              <button
                onClick={() => issueLink({ variables: { id: c.id, sendEmail: false } })}
                disabled={issuing}
                className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg bg-white hover:bg-gray-100 text-gray-800 disabled:opacity-40"
              >
                {t('Create link')}
              </button>
            )}
            <button
              onClick={() => issueLink({ variables: { id: c.id, sendEmail: true } })}
              disabled={issuing}
              className="text-xs px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40"
            >
              {live ? t('Resend email') : t('Email link now')}
            </button>
            <span className="text-xs text-gray-400">{t('to {email}', { email: p.email })}</span>
          </div>
        )}
      </div>
    );
  };

  const openCard = (c: any) => {
    const due = new Date(c.dueAt);
    const overdue = c.status === 'SCHEDULED' && due < new Date();
    const waiting = c.status === 'SENT';
    const reason = why(c);
    return (
      <div className="border border-gray-200 rounded-xl p-5 space-y-5 bg-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900">{t('Check-in {n}', { n: number.get(c.id) ?? 1 })}</p>
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${waiting ? 'bg-blue-50 text-blue-700' : overdue ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                {waiting ? t('Sent — awaiting response') : overdue ? t('Overdue') : t('Scheduled')}
              </span>
            </div>
            <CopyId id={c.id} className="-ml-1.5 mt-0.5" />
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-400">{t('Scheduled for')}</p>
          <p className={`text-2xl font-semibold mt-0.5 ${overdue ? 'text-red-600' : 'text-gray-900'}`}>{fmt(due, 'dd MMM yyyy')}</p>
          <p className="text-xs text-gray-500 mt-0.5">{timeAgo(due)}{reason && <span className="text-gray-400"> · {reason}</span>}</p>
        </div>

        {current && rxLink(t('Reviews prescription'), current)}

        <ol className="grid grid-cols-4 gap-2">
          {step(t('Scheduled'), 'done', c.dueAt)}
          {step(t('Sent'), c.sentAt ? 'done' : overdue ? 'overdue' : 'current', c.sentAt)}
          {step(t('Completed'), waiting ? 'current' : 'todo')}
          {step(t('Reviewed'), 'todo')}
        </ol>

        {linkPanel(c)}

        {canEditDate && (
          <div className="border-t border-dashed border-gray-200 pt-3">
            <p className="text-xs text-gray-400 mb-2">{t('Development only')}</p>
            {editingId === c.id ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="datetime-local"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  autoFocus
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  onClick={async () => {
                    await reschedule({ variables: { id: c.id, dueAt: new Date(date).toISOString() } });
                    setEditingId(null);
                  }}
                  disabled={!date || rescheduling}
                  className="text-xs px-2.5 py-1.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-40"
                >
                  {rescheduling ? '…' : t('Save')}
                </button>
                <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-600">{t('Cancel')}</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button onClick={() => { setEditingId(c.id); setDate(toLocalInput(due)); }} className="text-xs text-brand-500 hover:text-brand-900">{t('Edit scheduled date')}</button>
                <button onClick={() => reschedule({ variables: { id: c.id, dueAt: new Date().toISOString() } })} disabled={rescheduling} className="text-xs text-brand-500 hover:text-brand-900 disabled:opacity-40">
                  {t('Send now')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const doneRow = (c: any) => {
    const flags: any[] = c.redFlags ?? [];
    const critical = flags.some((f) => f.severity === 'CRITICAL');
    const expanded = showAnswers === c.id;
    return (
      <div className="border border-gray-200 rounded-xl bg-white">
        <div className="p-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {t('Check-in {n}', { n: number.get(c.id) ?? 1 })}
              <span className="text-xs font-normal text-gray-400"> · {t('Completed')} {fmt(c.completedAt, 'dd MMM yyyy')}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${c.wantsToReorder ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                {t('Reorder prescription:')} {c.wantsToReorder ? t('Yes') : t('No')}
              </span>
              {flags.length > 0 && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${critical ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                  {flags.length === 1 ? t('1 flag') : t('{n} flags', { n: flags.length })}
                </span>
              )}
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${c.reviewedAt ? 'bg-brand-50 text-brand-900' : 'bg-amber-50 text-amber-700'}`}>
                {c.reviewedAt ? t(OUTCOME_LABEL[c.outcome] ?? 'Reviewed') : t('Awaiting review')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {c.reportUrl && hasAccess(['ADMIN', 'DOCTOR']) && (
              <button type="button" onClick={() => openAuthedDocument(c.reportUrl, t)} className="text-xs font-medium text-brand-500 hover:underline">{t('Report PDF')}</button>
            )}
            <CopyId id={c.id} />
          </div>
        </div>

        {(c.prescription?.id && rxById.get(c.prescription.id)) || (c.resultPrescriptionId && rxById.get(c.resultPrescriptionId)) ? (
          <div className="px-4 pb-3 space-y-1">
            {c.prescription?.id && rxById.get(c.prescription.id) && rxLink(t('On prescription'), rxById.get(c.prescription.id))}
            {c.resultPrescriptionId && rxById.get(c.resultPrescriptionId) && rxLink(t('Led to'), rxById.get(c.resultPrescriptionId))}
          </div>
        ) : null}

        {(c.reviewedAt || flags.length > 0) && (
          <div className="px-4 pb-3 space-y-1.5">
            {flags.map((f, i) => (
              <p key={i} className={`text-xs ${f.severity === 'CRITICAL' ? 'text-red-700' : 'text-amber-800'}`}>⚑ {f.description}</p>
            ))}
            {c.reviewedAt && (
              <p className="text-xs text-gray-500">
                {t('Reviewed by {name}', { name: c.reviewedBy ? `Dr ${c.reviewedBy.lastName}` : '—' })} · {fmt(c.reviewedAt, 'dd MMM yyyy')}
                {c.reviewNote && <span className="text-gray-400"> · {c.reviewNote}</span>}
              </p>
            )}
            {c.billingNote && <p className="text-xs text-gray-400">{c.billingNote}</p>}
          </div>
        )}

        {c.answers?.length > 0 && (
          <div className="border-t border-gray-100">
            <button onClick={() => setShowAnswers(expanded ? null : c.id)} className="w-full text-left px-4 py-2.5 text-xs font-medium text-brand-500 hover:bg-gray-50 rounded-b-xl">
              {expanded ? t('Hide answers') : t('Show answers')}
            </button>
            {expanded && (
              <div className="px-4 pb-4 grid sm:grid-cols-2 gap-2">
                {c.answers.map((a: any) => (
                  <div key={a.questionId} className="bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-400">{a.question}</p>
                    <p className="text-xs font-medium text-gray-800 mt-0.5">{a.answer}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-5 space-y-5">
      <div className="bg-gray-50 rounded-md p-4">
        <p className="text-sm font-semibold text-gray-800">{t('Check-in')}</p>
        <p className="text-xs text-gray-500 mt-1">
          {t('Every 4 weeks the patient is automatically emailed a check-in quiz to review progress and confirm whether to reorder.')}
        </p>
      </div>

      <InlineError error={error} />

      {!p.activatedAt ? (
        <div className="border border-gray-100 rounded-md p-4 text-center text-sm text-gray-400">
          {t('Check-in schedule starts once the patient activates their account.')}
        </div>
      ) : all.length === 0 ? (
        <div className="border border-gray-100 rounded-md p-4 text-center text-sm text-gray-400">
          {t('First check-in hasn’t been scheduled yet.')}
        </div>
      ) : (
        <>
          <SearchInput className="w-full sm:w-80" value={query} onChange={setQuery} placeholder={t('Search by check-in or prescription ID…')} ariaLabel={t('Search by check-in or prescription ID…')} clearLabel={t('Clear search')} />
          {shown.length === 0 && <div className="py-8 text-center text-sm text-gray-400">{t('No check-ins match.')}</div>}
          {open.map((c) => <Fragment key={c.id}>{openCard(c)}</Fragment>)}
          {done.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('Earlier check-ins')}</p>
              {done.map((c) => <Fragment key={c.id}>{doneRow(c)}</Fragment>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
