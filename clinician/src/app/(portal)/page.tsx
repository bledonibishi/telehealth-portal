'use client';

import { useQuery } from '@apollo/client';
import Link from 'next/link';
import { GET_DASHBOARD_METRICS } from '@/graphql/dashboard';
import { getCurrentRole } from '@/lib/role';

type Metrics = {
  totalLeads: number;
  leadsThisWeek: number;
  newLeadsToday: number;
  totalPatients: number;
  activePatients: number;
  newPatientsThisWeek: number;
  conversionRate: number;
  pendingConsultations: number;
  approvedConsultations: number;
  pendingOrders: number;
  dispatchedOrders: number;
};

type StatCardProps = {
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  accent?: 'blue' | 'green' | 'purple' | 'amber' | 'red';
};

function StatCard({ label, value, sub, href, accent = 'blue' }: StatCardProps) {
  const accentMap = {
    blue:   { bar: 'bg-blue-500',   num: 'text-blue-700' },
    green:  { bar: 'bg-green-500',  num: 'text-green-700' },
    purple: { bar: 'bg-purple-500', num: 'text-purple-700' },
    amber:  { bar: 'bg-amber-500',  num: 'text-amber-700' },
    red:    { bar: 'bg-red-500',    num: 'text-red-700' },
  };
  const { bar, num } = accentMap[accent];

  const inner = (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-2 hover:shadow-sm transition-shadow">
      <div className={`w-8 h-1 rounded-full ${bar}`} />
      <p className={`text-3xl font-bold ${num}`}>{value}</p>
      <p className="text-sm font-medium text-gray-700">{label}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );

  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

type SectionProps = { title: string; children: React.ReactNode };
function Section({ title, children }: SectionProps) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{title}</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{children}</div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
      <div className="w-8 h-1 bg-gray-200 rounded-full mb-3" />
      <div className="h-8 w-20 bg-gray-200 rounded mb-2" />
      <div className="h-4 w-32 bg-gray-100 rounded" />
    </div>
  );
}

export default function DashboardPage() {
  const role = getCurrentRole();
  const { data, loading } = useQuery(GET_DASHBOARD_METRICS, {
    pollInterval: 60_000,
    skip: role !== 'ADMIN',
  });

  const m: Metrics | undefined = data?.dashboardMetrics;

  if (role !== 'ADMIN') {
    return (
      <div className="p-8 text-center text-gray-400 text-sm">
        Select a section from the sidebar to get started.
      </div>
    );
  }

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-6xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Good morning</h1>
        <p className="text-sm text-gray-400 mt-0.5">{today}</p>
      </div>

      <Section title="Leads">
        {loading ? (
          [1, 2, 3].map((k) => <SkeletonCard key={k} />)
        ) : (
          <>
            <StatCard
              label="Total leads"
              value={m?.totalLeads ?? 0}
              sub="All time"
              href="/leads"
              accent="blue"
            />
            <StatCard
              label="New this week"
              value={m?.leadsThisWeek ?? 0}
              sub="Last 7 days"
              href="/leads"
              accent="blue"
            />
            <StatCard
              label="New today"
              value={m?.newLeadsToday ?? 0}
              sub="Since midnight"
              href="/leads"
              accent="blue"
            />
          </>
        )}
      </Section>

      <Section title="Patients">
        {loading ? (
          [1, 2, 3, 4].map((k) => <SkeletonCard key={k} />)
        ) : (
          <>
            <StatCard
              label="Total patients"
              value={m?.totalPatients ?? 0}
              sub="All time"
              href="/patients"
              accent="green"
            />
            <StatCard
              label="Active patients"
              value={m?.activePatients ?? 0}
              sub="Account activated"
              href="/patients"
              accent="green"
            />
            <StatCard
              label="New this week"
              value={m?.newPatientsThisWeek ?? 0}
              sub="Last 7 days"
              href="/patients"
              accent="green"
            />
            <StatCard
              label="Conversion rate"
              value={`${m?.conversionRate ?? 0}%`}
              sub="Leads → patients"
              accent="green"
            />
          </>
        )}
      </Section>

      <Section title="Consultations">
        {loading ? (
          [1, 2].map((k) => <SkeletonCard key={k} />)
        ) : (
          <>
            <StatCard
              label="Awaiting review"
              value={m?.pendingConsultations ?? 0}
              sub="Submitted / in review"
              href="/queue"
              accent={(m?.pendingConsultations ?? 0) > 0 ? 'red' : 'purple'}
            />
            <StatCard
              label="Approved"
              value={m?.approvedConsultations ?? 0}
              sub="All time"
              href="/queue"
              accent="purple"
            />
          </>
        )}
      </Section>

      <Section title="Orders">
        {loading ? (
          [1, 2].map((k) => <SkeletonCard key={k} />)
        ) : (
          <>
            <StatCard
              label="Pending dispatch"
              value={m?.pendingOrders ?? 0}
              sub="Awaiting fulfilment"
              href="/orders"
              accent={(m?.pendingOrders ?? 0) > 0 ? 'amber' : 'blue'}
            />
            <StatCard
              label="Dispatched"
              value={m?.dispatchedOrders ?? 0}
              sub="All time"
              href="/orders"
              accent="blue"
            />
          </>
        )}
      </Section>
    </div>
  );
}
