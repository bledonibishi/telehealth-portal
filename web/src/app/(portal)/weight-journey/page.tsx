'use client';

import { useQuery } from '@apollo/client';
import { MY_WEIGHT_JOURNEY } from '@/graphql/weight';
import { WeightJourneyCard } from '@/components/weight/WeightJourneyCard';
import { WeightExplorer } from '@/components/weight/WeightExplorer';
import { WeightHistory } from '@/components/weight/WeightHistory';
import { PageHeader } from '@/components/portal/PageHeader';
import { Milestones } from '@/components/weight/Milestones';
import { BodyMeasurementsCard } from '@/components/weight/BodyMeasurementsCard';
import { JourneyPhotosProvider } from '@/components/weight/JourneyPhotos';
import { ComparePhotos } from '@/components/weight/ComparePhotos';
import { WeightCards } from '@/components/weight/WeightCards';
import { PhotoTimeline } from '@/components/weight/PhotoTimeline';
import { MeasurementsChart } from '@/components/weight/MeasurementsChart';
import { WeightTrendNotice } from '@/components/weight/WeightTrendNotice';
import { InlineError } from '@/components/common/Alert';

export default function WeightJourneyPage() {
  const { data, loading, error } = useQuery(MY_WEIGHT_JOURNEY, { fetchPolicy: 'cache-and-network' });
  const journey = data?.myWeightJourney;

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-8 max-w-5xl">
      <PageHeader title="Weight Journey" subtitle="Your weigh-ins and photos over time, with the date of each." />

      {loading && !journey && <p className="text-sm text-slate-400">Loading…</p>}
      {!journey && <InlineError error={error} />}
      {!loading && !error && !journey && (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-sm text-slate-500">
          The Weight Journey is available on our weight-management programme.
        </div>
      )}

      {journey && (
        // One full-screen photo view and one set of edit and delete dialogs for everything below.
        <JourneyPhotosProvider journey={journey}>
          <div className="space-y-6">
            <WeightJourneyCard journey={journey} showLink={false} allowLog={false} />
            <WeightTrendNotice />
            <Milestones journey={journey} />
            <ComparePhotos />
            <WeightCards />
            <BodyMeasurementsCard />

            <WeightExplorer
              extraTabs={[
                { key: 'photos', label: 'Photos', node: <PhotoTimeline /> },
                {
                  key: 'checkins',
                  label: 'Check-ins',
                  node: (
                    <div className="max-h-[24rem] overflow-y-auto pr-1">
                      {journey.entries.length === 0 && <p className="text-sm text-slate-400 mb-4">Your first check-in will appear here.</p>}
                      <WeightHistory starting={journey.startingWeightKg} entries={journey.entries} />
                    </div>
                  ),
                },
                { key: 'measurements', label: 'Measurements', node: <MeasurementsChart /> },
              ]}
            />

            <p className="text-xs text-slate-400">
              Everyone’s journey is different. This tracker is here to help you see your own progress — it isn’t a promise of any particular result.
            </p>
          </div>
        </JourneyPhotosProvider>
      )}
    </div>
  );
}
