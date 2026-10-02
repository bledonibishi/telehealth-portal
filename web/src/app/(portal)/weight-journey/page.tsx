'use client';

import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { MY_WEIGHT_JOURNEY } from '@/graphql/weight';
import { WeightJourneyCard } from '@/components/weight/WeightJourneyCard';
import { WeightExplorer } from '@/components/weight/WeightExplorer';
import { WeightHistory } from '@/components/weight/WeightHistory';
import { ProgressPhotosCard } from '@/components/weight/ProgressPhotosCard';

export default function WeightJourneyPage() {
  const { data, loading, error } = useQuery(MY_WEIGHT_JOURNEY, { fetchPolicy: 'cache-and-network' });
  const journey = data?.myWeightJourney;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h1 className="text-xl font-bold text-slate-900">Weight journey</h1>
        <Link href="/dashboard" className="text-xs font-medium text-brand-600 hover:text-brand-700">← Dashboard</Link>
      </div>

      {loading && !journey && <p className="text-sm text-slate-400">Loading…</p>}
      {error && !journey && <p className="text-sm text-danger-500">{error.message}</p>}
      {!loading && !error && !journey && (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-sm text-slate-500">
          The Weight Journey is available on our weight-management programme.
        </div>
      )}

      {journey && (
        <div className="space-y-3">
          <WeightJourneyCard journey={journey} showLink={false} allowLog={false} />

          <WeightExplorer
            extraTabs={[
              { key: 'photos', label: 'Photos', node: <ProgressPhotosCard /> },
              {
                key: 'checkins',
                label: 'Check-ins',
                node: (
                  <div className="max-h-[24rem] overflow-y-auto pr-1">
                    {journey.entries.length === 0 && <p className="text-sm text-slate-400 mb-4">Your first monthly check-in will appear here.</p>}
                    <WeightHistory starting={journey.startingWeightKg} entries={journey.entries} />
                  </div>
                ),
              },
            ]}
          />

          <p className="text-xs text-slate-400">
            Everyone’s journey is different. This tracker is here to help you see your own progress — it isn’t a promise of any particular result.
          </p>
        </div>
      )}
    </div>
  );
}
