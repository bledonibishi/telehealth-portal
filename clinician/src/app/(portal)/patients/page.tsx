'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@apollo/client';
import { differenceInYears, differenceInDays } from 'date-fns';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { GET_PATIENTS } from '@/graphql/patients';
import PatientPanel, { type Tab } from './PatientPanel';
import PatientHoverCard, { HOVER_CARD_HEIGHT } from '@/components/patients/PatientHoverCard';
import PatientChatWindow from '@/components/patients/PatientChatWindow';
import CreatePatientModal from '@/components/patients/CreatePatientModal';
import MedicationPill from '@/components/patients/MedicationPill';
import ProgressRing from '@/components/patients/ProgressRing';
import { kg } from '@/lib/weight';
import { TREATMENT_STATUS, STALE_WEIGH_IN_DAYS, type TreatmentStatus } from '@/lib/patient-status';
import { hasAccess } from '@/lib/role';
import HealthAlertsPanel from '@/components/patients/HealthAlertsPanel';
import { bmiBand, inBmiRange, joinedWithin, type BmiRange, type JoinedRange } from '@/lib/bmi';
import ExportCsvButton from '@/components/ExportCsvButton';
import type { CsvColumn } from '@/lib/csv';

const KIND_LABEL: Record<string, string> = { HRT: 'HRT', GLP1: 'GLP-1', TRT: 'TRT' };

const REVIEW_STATUS: Record<string, { label: string; cls: string }> = {
  SUBMITTED: { label: 'New', cls: 'bg-sky-500/15 text-sky-300' },
  IN_REVIEW: { label: 'In review', cls: 'bg-amber-500/15 text-amber-300' },
  MORE_INFO_REQUESTED: { label: 'Awaiting info', cls: 'bg-orange-500/15 text-orange-300' },
  APPROVED: { label: 'Approved', cls: 'bg-emerald-500/15 text-emerald-300' },
  DECLINED: { label: 'Declined', cls: 'bg-slate-500/20 text-[color:var(--t-muted)]' },
};
const NO_CONSULTATION = { label: 'No consultation', cls: 'bg-slate-500/10 text-[color:var(--t-dim)]' };
const NEEDS_REVIEW = ['SUBMITTED', 'IN_REVIEW', 'MORE_INFO_REQUESTED'];

const PROGRAMME_OPTIONS = [
  { value: 'ALL', label: 'All programmes' },
  { value: 'HRT', label: 'HRT' },
  { value: 'GLP1', label: 'GLP-1' },
  { value: 'TRT', label: 'TRT' },
];
const REVIEW_OPTIONS = [
  { value: 'ALL', label: 'All review statuses' },
  { value: 'NONE', label: 'No consultation' },
  ...Object.entries(REVIEW_STATUS).map(([value, { label }]) => ({ value, label })),
];
const BMI_OPTIONS: { value: BmiRange; label: string }[] = [
  { value: 'ALL', label: 'Any BMI' },
  { value: '25-30', label: 'BMI 25 to 30' },
  { value: '30-35', label: 'BMI 30 to 35' },
  { value: '35+', label: 'BMI 35 and over' },
  { value: 'NONE', label: 'No BMI yet' },
];
const JOINED_OPTIONS: { value: JoinedRange; label: string }[] = [
  { value: 'ALL', label: 'Any time joined' },
  { value: 'WEEK', label: 'Joined in the last 7 days' },
  { value: 'MONTH', label: 'Joined in the last 30 days' },
  { value: 'QUARTER', label: 'Joined in the last 3 months' },
];
const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All statuses' },
  ...Object.entries(TREATMENT_STATUS).map(([value, { label }]) => ({ value, label })),
];

type Quick = 'ACTIVE' | 'REVIEW' | 'TARGET' | 'REPLY';
type SortKey = 'name' | 'status' | 'medication' | 'bmi' | 'lost' | 'target' | 'progress' | 'lastCheckIn' | 'review';
type Sort = { key: SortKey; dir: 'asc' | 'desc' };

const selectCls = 'border border-[color:var(--border)] rounded-lg px-2.5 py-1.5 text-xs text-[color:var(--t-body)] bg-[color:var(--bg-card)] focus:outline-none focus:ring-2 focus:ring-sky-500';

const PATIENT_COLUMNS: CsvColumn<any>[] = [
  { header: 'First name', value: (p) => p.firstName },
  { header: 'Last name', value: (p) => p.lastName },
  { header: 'Email', value: (p) => p.email },
  { header: 'Date of birth', value: (p) => p.dateOfBirth?.slice(0, 10) },
  { header: 'Programme', value: (p) => KIND_LABEL[p.productKind] ?? p.productKind },
  { header: 'Treatment status', value: (p) => p.treatmentStatus },
  { header: 'Medication', value: (p) => p.medications.map((m: any) => `${m.label} ${m.dose}`.trim()).join('; ') },
  { header: 'Starting weight (kg)', value: (p) => p.startingWeightKg },
  { header: 'Current weight (kg)', value: (p) => p.currentWeightKg },
  { header: 'Target weight (kg)', value: (p) => p.targetWeightKg },
  { header: 'Height (cm)', value: (p) => p.heightCm },
  { header: 'BMI', value: (p) => p.bmi },
  { header: 'Weight lost (kg)', value: (p) => p.weightLostKg },
  { header: 'Progress (%)', value: (p) => p.progressPercentage },
  { header: 'Last weighed', value: (p) => p.lastWeighedAt },
  { header: 'Latest consultation', value: (p) => p.latestConsultationStatus },
  { header: 'Active prescription', value: (p) => p.hasActivePrescription },
  { header: 'Activated', value: (p) => p.activatedAt },
  { header: 'Created', value: (p) => p.createdAt },
];

const targetReached = (p: any) => p.progressPercentage !== null && p.progressPercentage >= 100;
const needsReview = (p: any) => NEEDS_REVIEW.includes(p.latestConsultationStatus);

// Patients without a value always sort last, whichever way the column goes.
function sortValue(p: any, key: SortKey): string | number | null {
  switch (key) {
    case 'name': return `${p.firstName} ${p.lastName}`.toLowerCase();
    case 'status': return TREATMENT_STATUS[p.treatmentStatus as TreatmentStatus]?.rank ?? 9;
    case 'medication': return p.medications[0]?.label.toLowerCase() ?? null;
    case 'bmi': return p.bmi ?? null;
    case 'lost': return p.weightLostKg ?? null;
    case 'target': return p.targetWeightKg ?? null;
    case 'progress': return p.progressPercentage ?? null;
    case 'lastCheckIn': return p.lastWeighedAt ? new Date(p.lastWeighedAt).getTime() : null;
    case 'review': return p.latestConsultationStatus ?? null;
  }
}

function SortHeader({ label, sortKey, sort, onSort, className = '' }: {
  label: string; sortKey: SortKey; sort: Sort; onSort: (key: SortKey) => void; className?: string;
}) {
  const { t } = useI18n();
  const active = sort.key === sortKey;
  return (
    <th className={`px-4 py-3 whitespace-nowrap font-medium ${className}`}>
      <button
        onClick={() => onSort(sortKey)}
        className={`flex items-center gap-1 hover:text-[color:var(--t-strong)] ${active ? 'text-[color:var(--t-strong)]' : ''}`}
      >
        {t(label)}
        <span className={`text-[10px] ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`}>
          {active && sort.dir === 'asc' ? '▲' : '▼'}
        </span>
      </button>
    </th>
  );
}

function StatCard({ label, value, hint, tone, active, onClick }: {
  label: string; value: number; hint?: string; tone: string; active?: boolean; onClick?: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={onClick ? !!active : undefined}
      className={`text-left rounded-xl border px-4 py-2.5 transition-colors ${
        active ? 'border-sky-400 bg-[color:var(--bg-hover)]' : 'border-[color:var(--border)] bg-[color:var(--bg-card)]'
      } ${onClick ? 'hover:border-[color:var(--border-strong)] cursor-pointer' : 'cursor-default'}`}
    >
      <p className="text-xs text-[color:var(--t-muted)]">{t(label)}</p>
      <p className={`text-2xl font-semibold ${tone}`}>{value.toLocaleString()}</p>
      {hint && <p className="text-[10px] text-[color:var(--t-dim)]">{hint}</p>}
    </button>
  );
}

function LastCheckIn({ patient }: { patient: any }) {
  const { t, timeAgo, fmt } = useI18n();
  if (patient.lastWeighedAt) {
    const when = new Date(patient.lastWeighedAt);
    const stale = patient.treatmentStatus === 'ACTIVE' && differenceInDays(new Date(), when) > STALE_WEIGH_IN_DAYS;
    return (
      <span className={stale ? 'text-amber-400 font-medium' : 'text-[color:var(--t-muted)]'} title={fmt(when, 'dd MMM yyyy')}>
        {timeAgo(when)}
        {stale && <span className="block text-[11px] font-normal">{t('Overdue')}</span>}
      </span>
    );
  }
  if (patient.lastCheckInDueAt && patient.lastCheckInStatus !== 'COMPLETED') {
    return <span className="text-[color:var(--t-dim)]">{t('Due {date}', { date: fmt(patient.lastCheckInDueAt, 'dd MMM') })}</span>;
  }
  return <span className="text-[color:var(--t-dim)]">—</span>;
}

export default function PatientsPage() {
  return (
    <Suspense>
      <Patients />
    </Suspense>
  );
}

function Patients() {
  const { t, timeAgo } = useI18n();
  const { data, loading, error, refetch } = useQuery(GET_PATIENTS, { pollInterval: 60_000 });
  const [search, setSearch] = useState('');
  const [programme, setProgramme] = useState('ALL');
  const [reviewStatus, setReviewStatus] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [medication, setMedication] = useState('ALL');
  const [bmiRange, setBmiRange] = useState<BmiRange>('ALL');
  const [joined, setJoined] = useState<JoinedRange>('ALL');
  const [quick, setQuick] = useState<Quick | null>(null);
  const [sort, setSort] = useState<Sort>({ key: 'status', dir: 'asc' });
  // ?patient=<id> opens that patient directly (linked from a consultation).
  // The open patient lives in the URL (?patient=<id>), so the "Patients" link in the menu and the
  // browser's Back button both return to the list, and a consultation can link straight to a patient.
  const router = useRouter();
  const selectedId = useSearchParams().get('patient');
  const [fullTab, setFullTab] = useState<Tab>('overview');
  const [creating, setCreating] = useState(false);
  const canCreate = hasAccess(['ADMIN']);
  const isPrescriber = hasAccess(['ADMIN', 'DOCTOR']);

  // Hovering a row previews that patient on the right; clicking the row or the preview opens the full profile.
  // The delays stop the panel flickering (and the patient being loaded) while the mouse just passes over rows.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewY, setPreviewY] = useState(0); // vertical centre of the hovered row, relative to the page
  const rootRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const schedule = (id: string | null, delay: number, y?: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (y !== undefined) setPreviewY(y);
      setPreviewId(id);
    }, delay);
  };
  const cancelSchedule = () => clearTimeout(timer.current);
  useEffect(() => () => clearTimeout(timer.current), []);
  // With the Messages card selected, clicking a patient opens a chat docked bottom-right instead of a profile.
  const [chatId, setChatId] = useState<string | null>(null);
  const chatMode = quick === 'REPLY';
  const closePreview = () => { clearTimeout(timer.current); setPreviewId(null); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePreview(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const openFull = (id: string, tab: Tab = 'overview') => { closePreview(); setChatId(null); setFullTab(tab); router.push(`/patients?patient=${encodeURIComponent(id)}`); };

  const all = data?.patients ?? [];

  const medicationOptions = useMemo(
    () => Array.from(new Set<string>(all.flatMap((p: any) => p.medications.map((m: any) => m.label)))).sort(),
    [all],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return all.filter((p: any) => {
      if (q && !(p.email.toLowerCase().includes(q) || p.firstName.toLowerCase().includes(q) || p.lastName.toLowerCase().includes(q))) return false;
      if (programme !== 'ALL' && p.productKind !== programme) return false;
      if (reviewStatus !== 'ALL') {
        if (reviewStatus === 'NONE' ? p.latestConsultationStatus : p.latestConsultationStatus !== reviewStatus) return false;
      }
      if (status !== 'ALL' && p.treatmentStatus !== status) return false;
      if (medication !== 'ALL' && !p.medications.some((m: any) => m.label === medication)) return false;
      if (!inBmiRange(p.bmi, bmiRange)) return false;
      if (!joinedWithin(p.createdAt, joined)) return false;
      if (quick === 'ACTIVE' && p.treatmentStatus !== 'ACTIVE') return false;
      if (quick === 'REVIEW' && !needsReview(p)) return false;
      if (quick === 'TARGET' && !targetReached(p)) return false;
      if (quick === 'REPLY' && !p.awaitingReply) return false;
      return true;
    });
  }, [all, search, programme, reviewStatus, status, medication, bmiRange, joined, quick]);

  const patients = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [filtered, sort]);

  const handleSort = (key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const activated = all.filter((p: any) => p.activatedAt).length;
  const counts = {
    active: all.filter((p: any) => p.treatmentStatus === 'ACTIVE').length,
    review: all.filter(needsReview).length,
    target: all.filter(targetReached).length,
    reply: all.filter((p: any) => p.awaitingReply).length,
  };
  const toggleQuick = (q: Quick) => setQuick((cur) => (cur === q ? null : q));

  const filtersActive = programme !== 'ALL' || reviewStatus !== 'ALL' || status !== 'ALL' || medication !== 'ALL' || bmiRange !== 'ALL' || joined !== 'ALL' || quick !== null;
  // The Total card: every patient, whatever filters or search were on.
  const showAll = () => { resetFilters(); setSearch(''); };
  const resetFilters = () => { setProgramme('ALL'); setReviewStatus('ALL'); setStatus('ALL'); setMedication('ALL'); setBmiRange('ALL'); setJoined('ALL'); setQuick(null); };

  const previewPatient = previewId && !chatMode ? all.find((p: any) => p.id === previewId) : null;
  const chatPatient = chatId ? all.find((p: any) => p.id === chatId) : null;

  return (
    <div ref={rootRef} className="relative h-full overflow-hidden bg-[color:var(--bg-page)] text-[color:var(--t-body)]">
      {/* List */}
      <div className={`${selectedId ? 'hidden' : 'flex'} h-full flex-col gap-4 p-3 sm:p-5`}>
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-2xl font-bold tracking-wide text-[color:var(--t-strong)] uppercase">{t('Doctor’s patient dashboard')}</h1>
            <p className="text-xs text-[color:var(--t-dim)] mt-0.5">{chatMode ? t('Click a patient to chat with them') : t('Hover a patient to preview their profile · click to open it in full')}</p>
          </div>
          <div className="flex items-center gap-2">
            <ExportCsvButton resource="patients" rows={patients} columns={PATIENT_COLUMNS} className="py-2" />
            {canCreate && (
              <button
                onClick={() => setCreating(true)}
                className="px-3.5 py-2 text-sm font-medium rounded-lg bg-sky-500 text-white hover:bg-sky-400"
              >
                {t('+ New patient')}
              </button>
            )}
          </div>
        </div>

        {isPrescriber && <HealthAlertsPanel />}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 shrink-0">
          <StatCard label="Total patients" value={all.length} hint={t('{n} activated · click to list all', { n: activated })} tone="text-emerald-400" active={!filtersActive && search === ''} onClick={showAll} />
          <StatCard label="Active on treatment" value={counts.active} tone="text-[color:var(--t-strong)]" active={quick === 'ACTIVE'} onClick={() => toggleQuick('ACTIVE')} />
          <StatCard label="Pending consults" value={counts.review} hint={t('Waiting for a clinician')} tone="text-amber-400" active={quick === 'REVIEW'} onClick={() => toggleQuick('REVIEW')} />
          <StatCard label="Target achieved" value={counts.target} hint={t('Reached their goal weight')} tone="text-[color:var(--t-strong)]" active={quick === 'TARGET'} onClick={() => toggleQuick('TARGET')} />
          <StatCard label="Messages" value={counts.reply} hint={t('Waiting for a reply')} tone="text-[color:var(--t-strong)]" active={quick === 'REPLY'} onClick={() => toggleQuick('REPLY')} />
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            type="text"
            placeholder={t('Search by name or email…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 border border-[color:var(--border)] rounded-lg px-3 py-1.5 text-sm bg-[color:var(--bg-card)] text-[color:var(--t-strong)] placeholder:text-[color:var(--t-dim)] focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <select value={programme} onChange={(e) => setProgramme(e.target.value)} className={selectCls}>
            {PROGRAMME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
          </select>
          <select value={medication} onChange={(e) => setMedication(e.target.value)} className={selectCls}>
            <option value="ALL">{t('All medications')}</option>
            {medicationOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
          </select>
          <select value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value)} className={selectCls}>
            {REVIEW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
          </select>
          <select value={bmiRange} onChange={(e) => setBmiRange(e.target.value as BmiRange)} className={selectCls} aria-label={t('BMI range')}>
            {BMI_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
          </select>
          <select value={joined} onChange={(e) => setJoined(e.target.value as JoinedRange)} className={selectCls} aria-label={t('Date joined')}>
            {JOINED_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
          </select>
          {filtersActive && (
            <button onClick={resetFilters} className="text-xs text-[color:var(--t-muted)] hover:text-[color:var(--t-body)] underline">
              {t('Clear filters')}
            </button>
          )}
          <span className="text-xs text-[color:var(--t-dim)] ml-auto">{t('{n} of {total}', { n: patients.length, total: all.length })}</span>
        </div>

        {loading && <p className="text-sm text-[color:var(--t-dim)]">{t('Loading…')}</p>}
        {error && <p className="text-sm text-rose-400">{error.message}</p>}

        <div
          className="flex-1 min-h-0 overflow-auto rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-panel)]"
          onMouseLeave={() => schedule(null, 300)}
        >
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="group bg-[color:var(--bg-card)] border-b border-[color:var(--border)] text-left text-xs text-[color:var(--t-muted)]">
                <SortHeader label="Patient name" sortKey="name" sort={sort} onSort={handleSort} className="pl-5" />
                <SortHeader label="Status" sortKey="status" sort={sort} onSort={handleSort} />
                <SortHeader label="Medication" sortKey="medication" sort={sort} onSort={handleSort} />
                <SortHeader label="BMI" sortKey="bmi" sort={sort} onSort={handleSort} />
                <SortHeader label="Weight lost" sortKey="lost" sort={sort} onSort={handleSort} />
                <SortHeader label="Target" sortKey="target" sort={sort} onSort={handleSort} />
                <SortHeader label="Goal progress" sortKey="progress" sort={sort} onSort={handleSort} />
                <SortHeader label="Last check-in" sortKey="lastCheckIn" sort={sort} onSort={handleSort} />
                <SortHeader label="Review" sortKey="review" sort={sort} onSort={handleSort} className="pr-5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border-subtle)]">
              {patients.map((patient: any) => {
                const age = differenceInYears(new Date(), new Date(patient.dateOfBirth));
                const review = patient.latestConsultationStatus ? REVIEW_STATUS[patient.latestConsultationStatus] : NO_CONSULTATION;
                const st = TREATMENT_STATUS[patient.treatmentStatus as TreatmentStatus];
                const hasGoal = patient.targetWeightKg !== null;
                const lost: number | null = patient.weightLostKg;
                const current = chatMode ? chatId === patient.id : previewId === patient.id;
                return (
                  <tr
                    key={patient.id}
                    onMouseEnter={(e) => {
                      if (chatMode) return;
                      const row = e.currentTarget.getBoundingClientRect();
                      const root = rootRef.current?.getBoundingClientRect();
                      schedule(patient.id, previewId ? 120 : 250, root ? row.top - root.top + row.height / 2 : undefined);
                    }}
                    onClick={() => (chatMode ? (cancelSchedule(), setChatId(patient.id)) : openFull(patient.id))}
                    className={`cursor-pointer transition-colors ${current ? 'bg-[color:var(--bg-hover)]' : 'hover:bg-[color:var(--bg-card)]'}`}
                  >
                    <td className="pl-5 pr-4 py-1.5">
                      <div className="flex items-center gap-3">
                        <div className="relative w-7 h-7 rounded-full bg-[color:var(--border)] flex items-center justify-center text-[11px] font-semibold text-[color:var(--t-body)] shrink-0">
                          {patient.firstName[0]}{patient.lastName[0]}
                          {patient.awaitingReply && (
                            <span
                              className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-[color:var(--bg-panel)]"
                              title={patient.lastMessageAt ? t('Waiting for a reply since {when}', { when: timeAgo(patient.lastMessageAt) }) : t('Waiting for a reply')}
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-[color:var(--t-strong)] whitespace-nowrap">{patient.firstName} {patient.lastName}</p>
                          <p className="text-xs text-[color:var(--t-dim)] truncate">
                            {t('{n} yrs', { n: age })}{patient.productKind ? ` · ${KIND_LABEL[patient.productKind]}` : ''} · {patient.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-1.5">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full whitespace-nowrap ${st.dark}`}>
                        {t(st.label)}
                      </span>
                    </td>
                    <td className="px-4 py-1.5">
                      {patient.medications.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {patient.medications.map((m: any, i: number) => <MedicationPill key={i} label={m.label} dose={m.dose} solid />)}
                        </div>
                      ) : <span className="text-[color:var(--t-dim)]">—</span>}
                    </td>
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      {patient.bmi == null ? <span className="text-[color:var(--t-dim)]" title={patient.heightCm == null ? t('No height on file') : undefined}>—</span> : (() => {
                        const band = bmiBand(patient.bmi);
                        return (
                          <span className={band.cls} title={t(band.label)}>
                            <span className="tabular-nums font-medium">{patient.bmi}</span>
                            <span className="block text-[11px] font-normal opacity-80">{t(band.label)}</span>
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      {lost === null ? <span className="text-[color:var(--t-dim)]">—</span> : (
                        <span className={`font-medium ${lost > 0 ? 'text-emerald-400' : lost < 0 ? 'text-rose-400' : 'text-[color:var(--t-muted)]'}`}>
                          {lost > 0 ? '−' : lost < 0 ? '+' : ''}{kg(Math.abs(lost))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-1.5 whitespace-nowrap text-[color:var(--t-body)]">
                      {hasGoal ? (
                        <>
                          {kg(patient.targetWeightKg)}
                          <span className="block text-[11px] text-[color:var(--t-dim)]">{t('now {weight}', { weight: kg(patient.currentWeightKg) })}</span>
                        </>
                      ) : patient.startingWeightKg !== null ? (
                        <span className="text-xs text-[color:var(--t-dim)]">{t('No target set')}</span>
                      ) : <span className="text-[color:var(--t-dim)]">—</span>}
                    </td>
                    <td className="px-4 py-1.5">
                      {hasGoal ? <ProgressRing value={patient.progressPercentage} size={34} stroke={3.5} /> : <span className="text-[color:var(--t-dim)]">—</span>}
                    </td>
                    <td className="px-4 py-1.5 whitespace-nowrap text-xs">
                      <LastCheckIn patient={patient} />
                    </td>
                    <td className="pl-4 pr-5 py-1.5">
                      <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded whitespace-nowrap ${review.cls}`}>{t(review.label)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!loading && patients.length === 0 && (
            <div className="p-12 text-center text-[color:var(--t-dim)] text-sm">
              {all.length === 0 ? t('No patients yet.') : t('No patients match these filters.')}
            </div>
          )}
        </div>

        {/* Chat — docked bottom-right; opening another patient replaces it */}
        {chatPatient && (
          <PatientChatWindow
            key={chatPatient.id}
            patientId={chatPatient.id}
            patientName={`${chatPatient.firstName} ${chatPatient.lastName}`}
            onClose={() => setChatId(null)}
            onOpenProfile={() => openFull(chatPatient.id, 'messages')}
            onActivity={() => { refetch(); }}
          />
        )}

        {/* Hover card — a small summary that sits beside the hovered row */}
        {previewPatient && (
          <div
            className="absolute z-20 right-6 transition-[top] duration-150 ease-out animate-slide-in-right"
            style={{ top: Math.min(Math.max(previewY - HOVER_CARD_HEIGHT / 2, 8), Math.max((rootRef.current?.clientHeight ?? 900) - HOVER_CARD_HEIGHT - 8, 8)) }}
            onMouseEnter={cancelSchedule}
            onClick={() => openFull(previewPatient.id)}
            onMouseLeave={() => schedule(null, 250)}
          >
            <PatientHoverCard patient={previewPatient} />
          </div>
        )}
      </div>

      {/* Patient panel */}
      {selectedId && (
        <div className="h-full overflow-hidden flex flex-col">
          <PatientPanel
            key={selectedId}
            patientId={selectedId}
            initialTab={fullTab}
            onClose={() => { router.push('/patients'); setFullTab('overview'); }}
          />
        </div>
      )}

      {creating && (
        <CreatePatientModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            router.push(`/patients?patient=${encodeURIComponent(id)}`);
          }}
        />
      )}
    </div>
  );
}
