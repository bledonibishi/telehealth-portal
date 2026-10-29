'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@apollo/client';
import { differenceInYears, differenceInDays } from 'date-fns';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { RECORD_MATCHES, GET_PATIENTS } from '@/graphql/patients';
import { PATIENTS_WITH_URGENT_MESSAGES } from '@/graphql/ai';
import { useAiFeature } from '@/lib/ai';
import { SmartPatientSearch, type SmartFilters } from '@/components/ai/SmartPatientSearch';
import { Pagination } from '@/components/ui/Pagination';
import { DataRows, SortableTh, tableDefaults, useTablePager } from '@/components/ui/data-table';
import { getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type PaginationState, type SortingState } from '@tanstack/react-table';
import PatientPanel, { TABS, type Tab } from './PatientPanel';
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
import { InlineError } from '@/components/ui/Alert';
import { Select } from '@/components/ui/Select';
import { SearchInput } from '@/components/ui/SearchInput';
import { SkeletonTableRows } from '@telehealth/loading';

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

/** One of the filter dropdowns: the app's own Select, so its list looks like every other dropdown and not the browser's. */
function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="w-40">
      <Select size="sm" ariaLabel={label} value={value} onChange={onChange} options={options} />
    </div>
  );
}


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

function StatCard({ label, value, hint, tone, active, onClick }: {
  label: string; value: number; hint?: string; tone: string; active?: boolean; onClick?: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={onClick ? !!active : undefined}
      title={hint}
      className={`flex items-baseline justify-between gap-3 px-4 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${
        active ? 'bg-[color:var(--bg-hover)] shadow-[inset_0_-2px_0_theme(colors.teal.600)]' : ''
      } ${onClick ? 'hover:bg-[color:var(--bg-hover)] cursor-pointer' : 'cursor-default'}`}
    >
      <span className="text-xs text-[color:var(--t-muted)] truncate">{t(label)}</span>
      <span className={`text-xl font-semibold tabular-nums ${tone}`}>{value.toLocaleString()}</span>
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
  const urgentOn = useAiFeature('urgency');
  const { data: urgentData } = useQuery(PATIENTS_WITH_URGENT_MESSAGES, { skip: !urgentOn, pollInterval: 30_000 });
  const urgentIds = new Set<string>(urgentData?.patientsWithUrgentMessages ?? []);
  const [programme, setProgramme] = useState('ALL');
  const [reviewStatus, setReviewStatus] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [medication, setMedication] = useState('ALL');
  const [bmiRange, setBmiRange] = useState<BmiRange>('ALL');
  const [joined, setJoined] = useState<JoinedRange>('ALL');
  const [quick, setQuick] = useState<Quick | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'status', desc: false }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  // ?patient=<id> opens that patient directly (linked from a consultation).
  // The open patient lives in the URL (?patient=<id>), so the "Patients" link in the menu and the
  // browser's Back button both return to the list, and a consultation can link straight to a patient.
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('patient');
  const [fullTab, setFullTab] = useState<Tab>('overview');
  // ?tab=messages opens the profile on that tab (linked from a notification about the patient's message). Only a tab that
  // exists counts, and it is handed to the panel on its first render: the panel keeps the tab it started on.
  const requestedTab = searchParams.get('tab');
  const linkedTab = TABS.find((t) => t === requestedTab) ?? null;
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

  // A prescription, check-in or order id (or its short form, "#x2xval74") finds the patient it belongs to.
  // Looked up only once typing pauses, and only for something that looks like an id (marked with # or TH-, or holding a digit):
  // an ordinary name or email never triggers it.
  const [code, setCode] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setCode(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const looksLikeId = /^(#|th-)?[a-z0-9]{6,40}$/i.test(code) && (/^(#|th-)/i.test(code) || /\d/.test(code));
  const { data: matchData } = useQuery(RECORD_MATCHES, { variables: { code }, skip: !looksLikeId });
  const matches: { patientId: string; kind: string; recordId: string }[] = looksLikeId ? matchData?.recordMatches ?? [] : [];
  const matchedPatients = new Set(matches.map((m) => m.patientId));

  const medicationOptions = useMemo(
    () => Array.from(new Set<string>(all.flatMap((p: any) => p.medications.map((m: any) => m.label)))).sort(),
    [all],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return all.filter((p: any) => {
      if (q && !(p.email.toLowerCase().includes(q) || p.firstName.toLowerCase().includes(q) || p.lastName.toLowerCase().includes(q) || matchedPatients.has(p.id))) return false;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, search, matchData, programme, reviewStatus, status, medication, bmiRange, joined, quick]);

  // The columns. Each sorts by the same value the old hand-made sort used; a patient with no value there always sorts last.
  const columns = useMemo<ColumnDef<any>[]>(() => {
    const sortBy = (key: SortKey) => ({ accessorFn: (p: any) => sortValue(p, key) ?? undefined, sortUndefined: 'last' as const, sortingFn: 'basic' as const, sortDescFirst: false });
    return [
      {
        id: 'name', header: 'Patient name', ...sortBy('name'),
        meta: { headerClassName: 'pl-5', cellClassName: 'pl-5 pr-4 py-1.5' },
        cell: ({ row }) => {
          const patient = row.original;
          const age = differenceInYears(new Date(), new Date(patient.dateOfBirth));
          return (
            <div className="flex items-center gap-3">
              <div className="relative w-7 h-7 rounded-full bg-[color:var(--border)] flex items-center justify-center text-[11px] font-semibold text-[color:var(--t-body)] shrink-0">
                {patient.firstName[0]}{patient.lastName[0]}
                {urgentIds.has(patient.id) && (
                  <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-[color:var(--bg-panel)]" title={t('A message here was marked possibly urgent')}>!</span>
                )}
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
          );
        },
      },
      {
        id: 'status', header: 'Status', ...sortBy('status'),
        meta: { cellClassName: 'px-4 py-1.5' },
        cell: ({ row }) => {
          const st = TREATMENT_STATUS[row.original.treatmentStatus as TreatmentStatus];
          return <span className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full whitespace-nowrap ${st.dark}`}>{t(st.label)}</span>;
        },
      },
      {
        id: 'medication', header: 'Medication', ...sortBy('medication'),
        meta: { cellClassName: 'px-4 py-1.5' },
        cell: ({ row }) =>
          row.original.medications.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {row.original.medications.map((m: any, i: number) => <MedicationPill key={i} label={m.label} dose={m.dose} solid />)}
            </div>
          ) : <span className="text-[color:var(--t-dim)]">—</span>,
      },
      {
        id: 'bmi', header: 'BMI', ...sortBy('bmi'),
        meta: { cellClassName: 'px-4 py-1.5 whitespace-nowrap' },
        cell: ({ row }) => {
          const patient = row.original;
          if (patient.bmi == null) return <span className="text-[color:var(--t-dim)]" title={patient.heightCm == null ? t('No height on file') : undefined}>—</span>;
          const band = bmiBand(patient.bmi);
          return (
            <span className={`inline-flex items-center gap-2 ${band.cls}`} title={t(band.label)}>
              <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
              <span className="tabular-nums font-medium">{patient.bmi}</span>
              <span className="text-[11px] font-normal opacity-80">{t(band.label)}</span>
            </span>
          );
        },
      },
      {
        id: 'lost', header: 'Weight lost', ...sortBy('lost'),
        meta: { cellClassName: 'px-4 py-1.5 whitespace-nowrap' },
        cell: ({ row }) => {
          const lost: number | null = row.original.weightLostKg;
          return lost === null ? <span className="text-[color:var(--t-dim)]">—</span> : (
            <span className={`font-medium ${lost > 0 ? 'text-emerald-400' : lost < 0 ? 'text-rose-400' : 'text-[color:var(--t-muted)]'}`}>
              {lost > 0 ? '−' : lost < 0 ? '+' : ''}{kg(Math.abs(lost))}
            </span>
          );
        },
      },
      {
        id: 'target', header: 'Target', ...sortBy('target'),
        meta: { cellClassName: 'px-4 py-1.5 whitespace-nowrap text-[color:var(--t-body)]' },
        cell: ({ row }) => {
          const patient = row.original;
          if (patient.targetWeightKg !== null) {
            return (
              <>
                {kg(patient.targetWeightKg)}
                <span className="block text-[11px] text-[color:var(--t-dim)]">{t('now {weight}', { weight: kg(patient.currentWeightKg) })}</span>
              </>
            );
          }
          return patient.startingWeightKg !== null ? <span className="text-xs text-[color:var(--t-dim)]">{t('No target set')}</span> : <span className="text-[color:var(--t-dim)]">—</span>;
        },
      },
      {
        id: 'progress', header: 'Goal progress', ...sortBy('progress'),
        meta: { cellClassName: 'px-4 py-1.5' },
        cell: ({ row }) => (row.original.targetWeightKg !== null ? <ProgressRing value={row.original.progressPercentage} size={34} stroke={3.5} /> : <span className="text-[color:var(--t-dim)]">—</span>),
      },
      {
        id: 'lastCheckIn', header: 'Last check-in', ...sortBy('lastCheckIn'),
        meta: { cellClassName: 'px-4 py-1.5 whitespace-nowrap text-xs' },
        cell: ({ row }) => <LastCheckIn patient={row.original} />,
      },
      {
        id: 'review', header: 'Review', ...sortBy('review'),
        meta: { headerClassName: 'pr-5', cellClassName: 'pl-4 pr-5 py-1.5' },
        cell: ({ row }) => {
          const review = row.original.latestConsultationStatus ? REVIEW_STATUS[row.original.latestConsultationStatus] : NO_CONSULTATION;
          return <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded whitespace-nowrap ${review.cls}`}>{t(review.label)}</span>;
        },
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, timeAgo, urgentData]);

  // The list is filtered in full above; the table sorts it and pages what is drawn. Exports and counts use the whole sorted list.
  const table = useReactTable({
    data: filtered,
    columns,
    getRowId: (p: any) => p.id,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    ...tableDefaults,
  });
  const patients: any[] = table.getSortedRowModel().rows.map((r) => r.original);
  const pager = useTablePager(table, { search, programme, reviewStatus, status, medication, bmiRange, joined, quick, sorting });
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
      {/* The whole list scrolls as one page; the root stays a fixed frame so the hover card and chat dock keep their place. */}
      <div className={`${selectedId ? 'hidden' : 'flex'} h-full flex-col gap-3 overflow-y-auto overflow-x-hidden p-3 sm:p-5`}>
        <div data-guide="page-header" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 shrink-0">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-[color:var(--t-strong)]">{t('Doctor’s patient dashboard')}</h1>
            <p className="text-xs text-[color:var(--t-dim)]">{chatMode ? t('Click a patient to chat with them') : t('Hover a patient to preview their profile · click to open it in full')}</p>
          </div>
          <div className="flex items-center gap-2">
            <ExportCsvButton resource="patients" rows={patients} columns={PATIENT_COLUMNS} />
            {canCreate && (
              <button
                onClick={() => setCreating(true)}
                className="h-9 px-3.5 text-[13px] font-medium rounded-lg bg-brand-500 text-white hover:opacity-90 transition-opacity"
              >
                {t('+ New patient')}
              </button>
            )}
          </div>
        </div>

        {isPrescriber && <div data-guide="patients:alerts"><HealthAlertsPanel /></div>}

        <div data-guide="patients:stats" className="grid grid-cols-2 lg:grid-cols-5 shrink-0 overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-card)] divide-x divide-y lg:divide-y-0 divide-[color:var(--border-subtle)]">
          <StatCard label="Total patients" value={all.length} hint={t('{n} activated · click to list all', { n: activated })} tone="text-emerald-400" active={!filtersActive && search === ''} onClick={showAll} />
          <StatCard label="Active on treatment" value={counts.active} tone="text-[color:var(--t-strong)]" active={quick === 'ACTIVE'} onClick={() => toggleQuick('ACTIVE')} />
          <StatCard label="Pending consults" value={counts.review} hint={t('Waiting for a clinician')} tone="text-amber-400" active={quick === 'REVIEW'} onClick={() => toggleQuick('REVIEW')} />
          <StatCard label="Target achieved" value={counts.target} hint={t('Reached their goal weight')} tone="text-[color:var(--t-strong)]" active={quick === 'TARGET'} onClick={() => toggleQuick('TARGET')} />
          <StatCard label="Messages" value={counts.reply} hint={t('Waiting for a reply')} tone="text-[color:var(--t-strong)]" active={quick === 'REPLY'} onClick={() => toggleQuick('REPLY')} />
        </div>

        <SmartPatientSearch
          medicationOptions={medicationOptions}
          onReset={showAll}
          onApply={(f: SmartFilters) => {
            resetFilters();
            setSearch(f.text ?? '');
            if (f.programme) setProgramme(f.programme);
            if (f.status) setStatus(f.status);
            if (f.reviewStatus) setReviewStatus(f.reviewStatus);
            if (f.bmiRange) setBmiRange(f.bmiRange as BmiRange);
            if (f.joined) setJoined(f.joined as JoinedRange);
            if (f.medication) setMedication(f.medication);
            if (f.quick) setQuick(f.quick as Quick);
          }}
        />

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <SearchInput className="w-full sm:w-56" value={search} onChange={setSearch} placeholder={t('Search name, email or ID…')} ariaLabel={t('Search name, email or ID…')} clearLabel={t('Clear search')} />
          {matches.length > 0 && (
            <span className="text-xs text-gray-500">
              {matches.map((m) => `${t(m.kind === 'PRESCRIPTION' ? 'Prescription' : m.kind === 'CHECK_IN' ? 'Check-in' : 'Order')} #${m.recordId.slice(-8)}`).join(' · ')}
            </span>
          )}
          <FilterSelect label={t('Programme')} value={programme} onChange={setProgramme} options={PROGRAMME_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))} />
          <FilterSelect label={t('Medication')} value={medication} onChange={setMedication} options={[{ value: 'ALL', label: t('All medications') }, ...medicationOptions.map((m) => ({ value: m, label: m }))]} />
          <FilterSelect label={t('Status')} value={status} onChange={setStatus} options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))} />
          <FilterSelect label={t('Review status')} value={reviewStatus} onChange={setReviewStatus} options={REVIEW_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))} />
          <FilterSelect label={t('BMI range')} value={bmiRange} onChange={(v) => setBmiRange(v as BmiRange)} options={BMI_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))} />
          <FilterSelect label={t('Date joined')} value={joined} onChange={(v) => setJoined(v as JoinedRange)} options={JOINED_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))} />
          {filtersActive && (
            <button onClick={resetFilters} className="text-xs text-[color:var(--t-muted)] hover:text-[color:var(--t-body)] underline">
              {t('Clear filters')}
            </button>
          )}
          <span className="text-xs text-[color:var(--t-dim)] ml-auto">{t('{n} of {total}', { n: patients.length, total: all.length })}</span>
        </div>

        <InlineError error={error} />

        <div
          className="shrink-0 overflow-x-auto rounded-md border border-[color:var(--border-subtle)] bg-[color:var(--bg-panel)]"
          onMouseLeave={() => schedule(null, 300)}
        >
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id} className="group bg-[color:var(--bg-card)] border-b border-[color:var(--border)] text-left text-xs text-[color:var(--t-muted)]">
                  {group.headers.map((header) => <SortableTh key={header.id} header={header} />)}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-[color:var(--border-subtle)]">
              {loading && !data && <SkeletonTableRows rows={8} cols={9} avatar label={t('Loading…')} />}
              <DataRows
                table={table}
                rowProps={(patient) => {
                  const current = chatMode ? chatId === patient.id : previewId === patient.id;
                  return {
                    onMouseEnter: (e) => {
                      if (chatMode) return;
                      const row = e.currentTarget.getBoundingClientRect();
                      const root = rootRef.current?.getBoundingClientRect();
                      schedule(patient.id, previewId ? 120 : 250, root ? row.top - root.top + row.height / 2 : undefined);
                    },
                    onClick: () => (chatMode ? (cancelSchedule(), setChatId(patient.id)) : openFull(patient.id)),
                    className: `cursor-pointer transition-colors ${current ? 'bg-[color:var(--bg-hover)]' : 'hover:bg-[color:var(--bg-card)]'}`,
                  };
                }}
              />
            </tbody>
          </table>

          {!loading && patients.length === 0 && (
            <div className="p-12 text-center text-[color:var(--t-dim)] text-sm">
              {all.length === 0 ? t('No patients yet.') : t('No patients match these filters.')}
            </div>
          )}
        </div>
        <Pagination state={pager} />

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
            key={`${selectedId}:${linkedTab ?? ''}`}
            patientId={selectedId}
            initialTab={linkedTab ?? fullTab}
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
