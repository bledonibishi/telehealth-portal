'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { MY_PROGRESS_PHOTOS, MY_WEIGHT_TIMELINE } from '@/graphql/weight';
import { MY_ONBOARDING } from '@/graphql/onboarding';
import { buildJourneyEntries, type JourneyEntry, type StartPhoto } from './journey-entries';
import { useOnWeightsChanged } from './weights-changed';

const DAY = 86_400_000;
const fileIdOf = (url?: string | null) => url?.match(/\/uploads\/([^/]+)\/file/)?.[1] ?? null;

/** Everything the journey's cards, comparison and full-screen photos are built from, reloaded when a weighing changes. */
export function useJourneyEntries(journey: { startingWeightKg?: number | null; targetWeightKg?: number | null }): { entries: JourneyEntry[]; loading: boolean } {
  // Fixed once, so the query isn't re-run every render.
  const [range] = useState(() => ({ from: new Date(Date.now() - 90 * DAY).toISOString(), to: new Date(Date.now() + DAY).toISOString() }));
  const photos = useQuery(MY_PROGRESS_PHOTOS, { fetchPolicy: 'cache-and-network' });
  const onboarding = useQuery(MY_ONBOARDING, { fetchPolicy: 'cache-first' });
  const recent = useQuery(MY_WEIGHT_TIMELINE, { variables: { ...range, limit: 300 }, fetchPolicy: 'cache-and-network' });
  useOnWeightsChanged(() => { void photos.refetch(); void recent.refetch(); });

  const entries = useMemo(() => {
    const rows = photos.data?.myProgressPhotos ?? [];
    const ob = onboarding.data?.myOnboarding;
    const startFile = fileIdOf(ob?.bodyPhotoFrontUrl);
    const startAt: string | null = ob?.submittedAt ?? rows[0]?.measuredAt ?? null;
    const start: StartPhoto | null = startFile && startAt ? { fileId: startFile, at: startAt, weightKg: journey.startingWeightKg ?? null } : null;
    return buildJourneyEntries({ start, photos: rows, recent: recent.data?.myWeightTimeline?.measurements ?? [], targetKg: journey.targetWeightKg ?? null });
  }, [photos.data, onboarding.data, recent.data, journey.startingWeightKg, journey.targetWeightKg]);

  return { entries, loading: photos.loading && !photos.data };
}
