'use client';

import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { MY_WEIGHT_JOURNEY } from '@/graphql/weight';
import { WeightJourneyCard } from '@/components/weight/WeightJourneyCard';
import { WeightExplorer } from '@/components/weight/WeightExplorer';
import { WeightHistory } from '@/components/weight/WeightHistory';

export default function WeightJourneyPage() {
  const { data, loading, error } = useQuery(MY_WEIGHT_JOURNEY, { fetchPolicy: 'cache-and-network' });
  const journey = data?.myWeightJourney;

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <Link href="/dashboard" className="text-xs font-medium text-brand-600 hover:text-brand-700">← Dashboard</Link>
      <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-6">Weight journey</h1>

      {loading && !journey && <p className="text-sm text-slate-400">Loading…</p>}
      {error && !journey && <p className="text-sm text-danger-500">{error.message}</p>}
      {!loading && !error && !journey && (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-sm text-slate-500">
          The Weight Journey is available on our weight-management programme.
        </div>
      )}

      {journey && (
        <>
          <WeightJourneyCard journey={journey} showLink={false} />

          <WeightExplorer />

          <section className="bg-white rounded-2xl border border-slate-100 p-5 sm:p-6" aria-label="Monthly check-ins">
            <h2 className="text-xs font-semibold text-brand-700 uppercase tracking-wide mb-4">Monthly check-ins</h2>
            {journey.entries.length === 0 && <p className="text-sm text-slate-400 mb-4">Your first monthly check-in will appear here.</p>}
            <WeightHistory starting={journey.startingWeightKg} entries={journey.entries} />
          </section>

          <p className="text-xs text-slate-400 mt-4">
            Everyone’s journey is different. This tracker is here to help you see your own progress — it isn’t a promise of any particular result.
          </p>
        </>
      )}
    </div>
  );
}
