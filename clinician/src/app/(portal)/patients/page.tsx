'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@apollo/client';
import { formatDistanceToNow, differenceInYears } from 'date-fns';
import { GET_PATIENTS } from '@/graphql/patients';
import PatientPanel from './PatientPanel';

const KIND_BADGE: Record<string, string> = {
  HRT: 'bg-violet-100 text-violet-700',
  GLP1: 'bg-teal-100 text-teal-700',
};

const REVIEW_STATUS: Record<string, { label: string; cls: string }> = {
  SUBMITTED: { label: 'New', cls: 'bg-blue-100 text-blue-800' },
  IN_REVIEW: { label: 'In review', cls: 'bg-yellow-100 text-yellow-800' },
  MORE_INFO_REQUESTED: { label: 'Awaiting info', cls: 'bg-orange-100 text-orange-800' },
  APPROVED: { label: 'Approved', cls: 'bg-green-100 text-green-800' },
  DECLINED: { label: 'Declined', cls: 'bg-gray-100 text-gray-600' },
};
const NO_CONSULTATION = { label: 'No consultation', cls: 'bg-gray-100 text-gray-400' };

const PROGRAMME_OPTIONS = [
  { value: 'ALL', label: 'All programmes' },
  { value: 'HRT', label: 'HRT' },
  { value: 'GLP1', label: 'GLP-1' },
];
const REVIEW_OPTIONS = [
  { value: 'ALL', label: 'All review statuses' },
  { value: 'NONE', label: 'No consultation' },
  ...Object.entries(REVIEW_STATUS).map(([value, { label }]) => ({ value, label })),
];
const ACCOUNT_OPTIONS = [
  { value: 'ALL', label: 'All accounts' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PENDING', label: 'Pending activation' },
];
const TREATMENT_OPTIONS = [
  { value: 'ALL', label: 'All treatment statuses' },
  { value: 'ON', label: 'On treatment' },
  { value: 'OFF', label: 'Not on treatment' },
];

type SortKey = 'name' | 'age' | 'programme' | 'review' | 'treatment' | 'account' | 'joined';
type Sort = { key: SortKey; dir: 'asc' | 'desc' };

const selectCls = 'border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500';

function sortValue(p: any, key: SortKey) {
  switch (key) {
    case 'name': return `${p.firstName} ${p.lastName}`.toLowerCase();
    case 'age': return new Date(p.dateOfBirth).getTime();
    case 'programme': return p.productKind ?? '';
    case 'review': return p.latestConsultationStatus ?? '';
    case 'treatment': return p.hasActivePrescription ? 1 : 0;
    case 'account': return p.activatedAt ? 1 : 0;
    case 'joined': return new Date(p.createdAt).getTime();
  }
}

function SortHeader({ label, sortKey, sort, onSort, className = '' }: {
  label: string; sortKey: SortKey; sort: Sort; onSort: (key: SortKey) => void; className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th className={`px-6 py-3 ${className}`}>
      <button
        onClick={() => onSort(sortKey)}
        className={`flex items-center gap-1 hover:text-gray-700 ${active ? 'text-gray-700' : ''}`}
      >
        {label}
        <span className={`text-[10px] ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-30'}`}>
          {active && sort.dir === 'asc' ? '▲' : '▼'}
        </span>
      </button>
    </th>
  );
}

export default function PatientsPage() {
  return (
    <Suspense>
      <Patients />
    </Suspense>
  );
}

function Patients() {
  const { data, loading, error } = useQuery(GET_PATIENTS, { pollInterval: 60_000 });
  const [search, setSearch] = useState('');
  const [programme, setProgramme] = useState('ALL');
  const [reviewStatus, setReviewStatus] = useState('ALL');
  const [account, setAccount] = useState('ALL');
  const [treatment, setTreatment] = useState('ALL');
  const [sort, setSort] = useState<Sort>({ key: 'joined', dir: 'desc' });
  // ?patient=<id> opens that patient directly (linked from a consultation).
  const [selectedId, setSelectedId] = useState<string | null>(useSearchParams().get('patient'));

  const all = data?.patients ?? [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return all.filter((p: any) => {
      if (q && !(p.email.toLowerCase().includes(q) || p.firstName.toLowerCase().includes(q) || p.lastName.toLowerCase().includes(q))) return false;
      if (programme !== 'ALL' && p.productKind !== programme) return false;
      if (reviewStatus !== 'ALL') {
        if (reviewStatus === 'NONE' ? p.latestConsultationStatus : p.latestConsultationStatus !== reviewStatus) return false;
      }
      if (account === 'ACTIVE' && !p.activatedAt) return false;
      if (account === 'PENDING' && p.activatedAt) return false;
      if (treatment === 'ON' && !p.hasActivePrescription) return false;
      if (treatment === 'OFF' && p.hasActivePrescription) return false;
      return true;
    });
  }, [all, search, programme, reviewStatus, account, treatment]);

  const patients = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [filtered, sort]);

  const handleSort = (key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const activated = all.filter((p: any) => p.activatedAt).length;
  const needsReview = all.filter((p: any) => ['SUBMITTED', 'IN_REVIEW', 'MORE_INFO_REQUESTED'].includes(p.latestConsultationStatus)).length;
  const onTreatment = all.filter((p: any) => p.hasActivePrescription).length;

  const filtersActive = programme !== 'ALL' || reviewStatus !== 'ALL' || account !== 'ALL' || treatment !== 'ALL';
  const resetFilters = () => { setProgramme('ALL'); setReviewStatus('ALL'); setAccount('ALL'); setTreatment('ALL'); };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* List */}
      <div className={`flex flex-col transition-all duration-200 ${selectedId ? 'hidden' : 'flex-1'} border-r border-gray-200 overflow-hidden`}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200 bg-white flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Patients</h1>
            <p className="text-xs text-gray-500 mt-0.5">Users who purchased and activated their account</p>
          </div>
          <div className="flex gap-4 text-sm">
            <div className="text-center">
              <p className="font-semibold text-gray-900">{all.length}</p>
              <p className="text-xs text-gray-400">Total</p>
            </div>
            <div className="text-center">
              <p className="font-semibold text-green-600">{activated}</p>
              <p className="text-xs text-gray-400">Activated</p>
            </div>
            <div className="text-center">
              <p className="font-semibold text-orange-600">{needsReview}</p>
              <p className="text-xs text-gray-400">Needs review</p>
            </div>
            <div className="text-center">
              <p className="font-semibold text-brand-500">{onTreatment}</p>
              <p className="text-xs text-gray-400">On treatment</p>
            </div>
          </div>
        </div>

        {/* Search + filters */}
        <div className="px-6 py-3 bg-white border-b border-gray-100 shrink-0 space-y-2">
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select value={programme} onChange={(e) => setProgramme(e.target.value)} className={selectCls}>
              {PROGRAMME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value)} className={selectCls}>
              {REVIEW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={account} onChange={(e) => setAccount(e.target.value)} className={selectCls}>
              {ACCOUNT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={treatment} onChange={(e) => setTreatment(e.target.value)} className={selectCls}>
              {TREATMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {filtersActive && (
              <button onClick={resetFilters} className="text-xs text-gray-400 hover:text-gray-600 underline">
                Clear filters
              </button>
            )}
            <span className="text-xs text-gray-400 ml-auto">
              {patients.length} of {all.length}
            </span>
          </div>
        </div>

        {loading && <p className="p-6 text-sm text-gray-400">Loading…</p>}
        {error && <p className="p-6 text-sm text-red-500">{error.message}</p>}

        <div className="overflow-y-auto flex-1">
          {selectedId ? (
            /* Compact list when panel open */
            <div className="divide-y divide-gray-100">
              {patients.map((patient: any) => {
                const age = differenceInYears(new Date(), new Date(patient.dateOfBirth));
                const active = selectedId === patient.id;
                return (
                  <button
                    key={patient.id}
                    onClick={() => setSelectedId(patient.id)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${active ? 'bg-brand-50 border-l-2 border-brand-500' : ''}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0">
                      {patient.firstName[0]}{patient.lastName[0]}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${active ? 'text-brand-900' : 'text-gray-900'}`}>
                        {patient.firstName} {patient.lastName}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{age} yrs · {patient.email}</p>
                    </div>
                    {patient.activatedAt ? (
                      <span className="ml-auto shrink-0 w-2 h-2 rounded-full bg-green-400" />
                    ) : (
                      <span className="ml-auto shrink-0 w-2 h-2 rounded-full bg-amber-400" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            /* Full table when no panel open */
            <table className="w-full text-sm">
              <thead>
                <tr className="group bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <SortHeader label="Patient" sortKey="name" sort={sort} onSort={handleSort} />
                  <SortHeader label="Age" sortKey="age" sort={sort} onSort={handleSort} />
                  <SortHeader label="Programme" sortKey="programme" sort={sort} onSort={handleSort} />
                  <SortHeader label="Review" sortKey="review" sort={sort} onSort={handleSort} />
                  <SortHeader label="Treatment" sortKey="treatment" sort={sort} onSort={handleSort} />
                  <SortHeader label="Account" sortKey="account" sort={sort} onSort={handleSort} />
                  <SortHeader label="Joined" sortKey="joined" sort={sort} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {patients.map((patient: any) => {
                  const age = differenceInYears(new Date(), new Date(patient.dateOfBirth));
                  const review = patient.latestConsultationStatus ? REVIEW_STATUS[patient.latestConsultationStatus] : NO_CONSULTATION;
                  return (
                    <tr
                      key={patient.id}
                      onClick={() => setSelectedId(patient.id)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
                            {patient.firstName[0]}{patient.lastName[0]}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{patient.firstName} {patient.lastName}</p>
                            <p className="text-xs text-gray-400">{patient.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-gray-600">{age} yrs</td>
                      <td className="px-6 py-3">
                        {patient.productKind ? (
                          <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded ${KIND_BADGE[patient.productKind] ?? 'bg-gray-100 text-gray-600'}`}>
                            {patient.productKind === 'GLP1' ? 'GLP-1' : patient.productKind}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded ${review.cls}`}>{review.label}</span>
                      </td>
                      <td className="px-6 py-3">
                        {patient.hasActivePrescription ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-500" /> On treatment
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-6 py-3">
                        {patient.activatedAt ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">✓ Active</span>
                        ) : (
                          <span className="inline-flex items-center text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded">Awaiting activation</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {formatDistanceToNow(new Date(patient.createdAt), { addSuffix: true })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {!loading && patients.length === 0 && (
            <div className="p-12 text-center text-gray-400 text-sm">
              {all.length === 0 ? 'No patients yet.' : 'No patients match these filters.'}
            </div>
          )}
        </div>
      </div>

      {/* Patient panel */}
      {selectedId && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <PatientPanel
            patientId={selectedId}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}
    </div>
  );
}
