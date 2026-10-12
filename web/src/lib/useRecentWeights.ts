'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { MY_WEIGHT_FORECAST, MY_WEIGHT_TIMELINE } from '@/graphql/weight';

const DAY = 86_400_000;
export const RECENT_DAYS = 90;

/** The last three months of the patient's weigh-ins and the pace-based forecast, loaded once for everything on the dashboard that needs them. */
export function useRecentWeights(skip = false) {
  // Fixed once, so the query isn't re-run every render.
  const [range] = useState(() => ({ from: new Date(Date.now() - RECENT_DAYS * DAY).toISOString(), to: new Date(Date.now() + 3_600_000).toISOString() }));
  const { data } = useQuery(MY_WEIGHT_TIMELINE, { variables: { ...range, limit: 300 }, fetchPolicy: 'cache-and-network', skip });
  const { data: fData } = useQuery(MY_WEIGHT_FORECAST, { fetchPolicy: 'cache-and-network', skip });

  const points: { t: number; w: number }[] = useMemo(
    () => (data?.myWeightTimeline?.measurements ?? []).map((m: any) => ({ t: Date.parse(m.measuredAt), w: m.weightKg })),
    [data],
  );
  return { points, forecast: fData?.myWeightForecast ?? null };
}
