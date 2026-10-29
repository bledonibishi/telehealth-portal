'use client';

import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { GET_LEADS } from '@/graphql/leads';
import ExportCsvButton from '@/components/ExportCsvButton';
import type { CsvColumn } from '@/lib/csv';
import { InlineError } from '@/components/ui/Alert';
import { SearchInput } from '@/components/ui/SearchInput';
import { RiskBadge } from '@/components/consultation/RiskBadge';
import { SkeletonTableRows } from '@telehealth/loading';
import { Pagination, usePagination } from '@/components/ui/Pagination';

const KIND_BADGE: Record<string, string> = {
  HRT: 'bg-violet-100 text-violet-700',
  GLP1: 'bg-teal-100 text-teal-700',
  TRT: 'bg-sky-100 text-sky-700',
};

const LEAD_COLUMNS: CsvColumn<any>[] = [
  { header: 'First name', value: (l) => l.firstName },
  { header: 'Last name', value: (l) => l.lastName },
  { header: 'Email', value: (l) => l.email },
  { header: 'Programme', value: (l) => l.productKind },
  { header: 'Became a patient', value: (l) => !!l.convertedAt },
  { header: 'Converted', value: (l) => l.convertedAt },
  { header: 'Stage', value: (l) => l.stage },
  { header: 'Treatment', value: (l) => l.treatment },
  { header: 'Referral code', value: (l) => l.referralCode },
  { header: 'Submitted', value: (l) => l.createdAt },
  { header: 'Last activity', value: (l) => l.updatedAt },
];

const STAGE_LABEL: Record<string, string> = {
  QUIZ: 'Quiz only',
  HEALTH_ANSWERED: 'Answered the health questions',
  AT_CHECKOUT: 'Reached checkout',
  PAID: 'Paid',
};

// Came back (redid the quiz or went on to checkout) more than an hour after first submitting.
const returned = (l: any) => new Date(l.updatedAt).getTime() - new Date(l.createdAt).getTime() > 3_600_000;

type Filter = 'ALL' | 'PENDING' | 'CONVERTED';

const initials = (l: any) => `${l.firstName?.[0] ?? ''}${l.lastName?.[0] ?? ''}`.toUpperCase();

function StatCard({ label, value, hint, tone, active, onClick }: { label: string; value: string | number; hint?: string; tone: string; active?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${tone}`}>{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </>
  );
  const cls = `text-left rounded-xl border bg-white px-4 py-3 ${active ? 'border-brand-500 ring-1 ring-brand-500' : 'border-gray-200'}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} hover:border-gray-300 transition-colors`}>{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export default function LeadsPage() {
  const { t, timeAgo, fmt } = useI18n();
  const { data, loading, error } = useQuery(GET_LEADS, { pollInterval: 60_000 });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [programme, setProgramme] = useState('ALL');
  const [copied, setCopied] = useState<string | null>(null);

  const all: any[] = useMemo(
    () => [...(data?.leads ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [data],
  );
  const total = all.length;
  const converted = all.filter((l) => l.convertedAt).length;
  const pending = total - converted;
  const rate = total ? Math.round((converted / total) * 100) : 0;
  const programmes = Array.from(new Set(all.map((l) => l.productKind as string))).sort();

  const leads = all.filter((l) => {
    if (filter === 'PENDING' && l.convertedAt) return false;
    if (filter === 'CONVERTED' && !l.convertedAt) return false;
    if (programme !== 'ALL' && l.productKind !== programme) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return l.email.toLowerCase().includes(q) || l.firstName.toLowerCase().includes(q) || l.lastName.toLowerCase().includes(q);
  });

  const pager = usePagination(leads, { search, filter, programme });

  const toggle = (f: Filter) => setFilter((cur) => (cur === f ? 'ALL' : f));
  const chip = (active: boolean) =>
    `px-3 py-1 rounded-full text-xs font-medium border transition-colors ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`;

  return (
    <div>
      {/* Header */}
      <div data-guide="page-header" className="px-4 sm:px-6 py-5 border-b border-gray-200 bg-white flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t('Leads')}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{t('Users who completed the eligibility quiz')}</p>
        </div>
        <ExportCsvButton resource="leads" rows={leads} columns={LEAD_COLUMNS} />
      </div>

      <div className="px-4 sm:px-6 py-5 space-y-4">
        {/* Summary */}
        <div data-guide="leads:stats" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label={t('Total')} value={total} hint={t('Completed the quiz')} tone="text-gray-900" active={filter === 'ALL'} onClick={() => setFilter('ALL')} />
          <StatCard label={t('Not converted')} value={pending} hint={t('Haven’t paid yet')} tone="text-amber-600" active={filter === 'PENDING'} onClick={() => toggle('PENDING')} />
          <StatCard label={t('Converted')} value={converted} hint={t('Became patients')} tone="text-green-600" active={filter === 'CONVERTED'} onClick={() => toggle('CONVERTED')} />
          <StatCard label={t('Conversion rate')} value={`${rate}%`} hint={t('{n} of {total} paid', { n: converted, total })} tone="text-gray-900" />
        </div>

        {/* Filters */}
        <div data-guide="leads:filters" className="flex flex-wrap items-center gap-2">
          <SearchInput className="w-full sm:w-72" value={search} onChange={setSearch} placeholder={t('Search by name or email…')} ariaLabel={t('Search by name or email…')} clearLabel={t('Clear search')} />
          <div className="flex flex-wrap items-center gap-1.5 sm:ml-2">
            <button type="button" onClick={() => setProgramme('ALL')} className={chip(programme === 'ALL')}>{t('All programmes')}</button>
            {programmes.map((k) => (
              <button key={k} type="button" onClick={() => setProgramme(programme === k ? 'ALL' : k)} className={chip(programme === k)}>{k}</button>
            ))}
          </div>
        </div>

        <InlineError error={error} />

        {/* Table */}
        <div data-guide="leads:list" className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 sm:px-5 py-3 font-medium">{t('Lead')}</th>
                  <th className="px-4 py-3 font-medium">{t('Product')}</th>
                  <th className="px-4 py-3 font-medium">{t('Eligibility')}</th>
                  <th className="px-4 py-3 font-medium">{t('Status')}</th>
                  <th className="px-4 py-3 font-medium">{t('Submitted')}</th>
                  <th className="px-4 sm:px-5 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && !data && <SkeletonTableRows rows={6} cols={6} label={t('Loading…')} />}
                {pager.items.map((lead: any) => {
                  const open = expanded === lead.id;
                  return (
                    <Fragment key={lead.id}>
                      <tr onClick={() => setExpanded(open ? null : lead.id)} className={`cursor-pointer transition-colors ${open ? 'bg-gray-50' : 'hover:bg-gray-50/70'}`}>
                        <td className="px-4 sm:px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span className="w-9 h-9 shrink-0 rounded-full bg-brand-50 text-brand-900 text-xs font-semibold flex items-center justify-center">{initials(lead)}</span>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 truncate">{lead.firstName} {lead.lastName}</p>
                              <p className="text-xs text-gray-500 truncate">{lead.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${KIND_BADGE[lead.productKind] ?? 'bg-gray-100 text-gray-600'}`}>{lead.productKind}</span>
                        </td>
                        <td className="px-4 py-3"><RiskBadge tag={lead.riskTag} /></td>
                        <td className="px-4 py-3">
                          {lead.convertedAt ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">✓ {t('Patient')}</span>
                          ) : (
                            <span className="inline-flex items-center text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded">{t('Not paid')}</span>
                          )}
                          {!lead.convertedAt && <p className="text-xs text-gray-400 mt-1">{t(STAGE_LABEL[lead.stage] ?? STAGE_LABEL.QUIZ)}</p>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-xs text-gray-700">{timeAgo(lead.createdAt)}</p>
                          <p className="text-xs text-gray-400">{fmt(lead.createdAt, 'dd MMM yyyy')}</p>
                          {returned(lead) && !lead.convertedAt && <p className="text-xs text-blue-600">{t('Back {when}', { when: timeAgo(lead.updatedAt) })}</p>}
                        </td>
                        <td className="px-4 sm:px-5 py-3 text-gray-400">
                          <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-label={open ? t('Hide quiz') : t('View quiz')}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </td>
                      </tr>

                      {open && (
                        <tr>
                          <td colSpan={6} className="px-4 sm:px-5 py-5 bg-gray-50 border-b border-gray-100">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('Quiz summary')} — {lead.productKind}</p>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(lead.email); setCopied(lead.id); setTimeout(() => setCopied((c) => (c === lead.id ? null : c)), 1500); }}
                                className="text-xs text-brand-500 hover:text-brand-900"
                              >
                                {copied === lead.id ? t('Copied!') : t('Copy email')}
                              </button>
                            </div>
                            {lead.riskReasons?.length > 0 && (
                              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3">
                                <p className="text-xs font-semibold text-amber-800 mb-1">{t('Why it was flagged')}</p>
                                <ul className="text-xs text-amber-900 list-disc pl-4 space-y-0.5">
                                  {lead.riskReasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
                                </ul>
                              </div>
                            )}
                            <dl className="mb-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-3 text-xs">
                              {[
                                [t('Treatment'), lead.treatment ?? '—'],
                                [t('Delivery'), [lead.deliveryCity, lead.deliveryCountry].filter(Boolean).join(', ') || '—'],
                                [t('Health questions'), lead.intakeSavedAt ? fmt(lead.intakeSavedAt, 'dd MMM yyyy') : '—'],
                                [t('Referral code'), lead.referralCode ?? '—'],
                                [t('First submitted'), fmt(lead.createdAt, 'dd MMM yyyy HH:mm')],
                                [t('Last activity'), fmt(lead.updatedAt, 'dd MMM yyyy HH:mm')],
                                [t('Reminders'), lead.remindersStoppedAt ? t('Stopped by the lead') : t('{n} sent', { n: lead.reminderCount })],
                              ].map(([label, value]) => (
                                <div key={label} className="rounded-lg border border-gray-100 bg-white px-3 py-2">
                                  <dt className="text-gray-400">{label}</dt>
                                  <dd className="mt-0.5 font-medium text-gray-800 break-words">{value}</dd>
                                </div>
                              ))}
                            </dl>
                            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                              {(lead.quizAnswers ?? []).map((a: any, i: number) => (
                                <div key={i} className="bg-white rounded-lg border border-gray-100 px-4 py-2.5">
                                  <p className="text-xs text-gray-400">{a.question}</p>
                                  <p className="text-sm text-gray-800 font-medium mt-0.5">{a.answer}</p>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!loading && leads.length === 0 && (
            <div className="p-12 text-center text-gray-400 text-sm">{total === 0 ? t('No leads yet.') : t('No leads match your filters.')}</div>
          )}
        </div>
        <Pagination state={pager} />
      </div>
    </div>
  );
}
