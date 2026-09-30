'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApolloClient } from '@apollo/client';
import { MY_WEIGHT_TIMELINE } from '@/graphql/weight';
import { mergePoints, Point, yearEnd, yearStart } from './timeseries';

export interface TimelineMeta {
  startingWeightKg: number | null;
  startingAt: number | null;
  targetWeightKg: number | null;
  earliestAt: number | null;
  latestAt: number | null;
}

const toPoint = (m: any): Point => ({
  id: m.id,
  t: Date.parse(m.measuredAt),
  w: m.weightKg,
  kind: m.kind,
  changeKg: m.changeKg,
  note: m.note,
  feeling: m.feeling,
});
const ms = (v: string | null | undefined) => (v ? Date.parse(v) : null);

/**
 * A patient's weighings, loaded a calendar year at a time as the chart/month navigation asks for
 * them. Moving between months of a loaded year costs nothing; going to another year fetches just
 * that year. `refresh()` re-reads everything already loaded (after adding or removing an entry).
 */
export function useWeightTimeline() {
  const client = useApolloClient();
  const [chunks, setChunks] = useState<Record<number, Point[]>>({});
  const [meta, setMeta] = useState<TimelineMeta | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const requested = useRef(new Set<number>());
  // Years whose last request failed, so Retry reloads those (not just the current year).
  const failed = useRef(new Set<number>());

  const fetchYear = useCallback(
    async (year: number, fresh: boolean) => {
      setPending((n) => n + 1);
      try {
        const { data } = await client.query({
          query: MY_WEIGHT_TIMELINE,
          variables: { from: new Date(yearStart(year)).toISOString(), to: new Date(yearEnd(year)).toISOString(), limit: 5000 },
          fetchPolicy: fresh ? 'network-only' : 'cache-first',
        });
        const tl = data.myWeightTimeline;
        setChunks((c) => ({ ...c, [year]: tl.measurements.map(toPoint) }));
        setMeta({
          startingWeightKg: tl.startingWeightKg ?? null,
          startingAt: ms(tl.startingAt),
          targetWeightKg: tl.targetWeightKg ?? null,
          earliestAt: ms(tl.earliestAt),
          latestAt: ms(tl.latestAt),
        });
        if (tl.truncated) setTruncated(true);
        failed.current.delete(year);
        setError((e) => (failed.current.size === 0 ? null : e)); // stay in error while another year is still failing
      } catch (e: any) {
        requested.current.delete(year); // let a retry ask again
        failed.current.add(year);
        setError(e?.message ?? 'Couldn’t load your weights');
      } finally {
        setPending((n) => n - 1);
      }
    },
    [client],
  );

  /** Make sure every calendar year touched by [from, to] is loaded (or loading). */
  const ensureRange = useCallback(
    (from: number, to: number) => {
      const a = new Date(from).getFullYear();
      const b = new Date(to).getFullYear();
      for (let y = a; y <= b && y - a < 30; y++) {
        if (requested.current.has(y)) continue;
        requested.current.add(y);
        void fetchYear(y, true); // always fresh on first load: a weight may have been added elsewhere (e.g. the dashboard)
      }
    },
    [fetchYear],
  );

  const refresh = useCallback(async () => {
    await Promise.all([...requested.current].map((y) => fetchYear(y, true)));
  }, [fetchYear]);

  const retry = useCallback(() => {
    setError(null);
    const years = new Set(failed.current);
    if (years.size === 0) years.add(new Date().getFullYear()); // nothing recorded as failed: redo the first (current-year) load
    for (const y of years) {
      requested.current.add(y);
      void fetchYear(y, true);
    }
  }, [fetchYear]);

  useEffect(() => {
    ensureRange(Date.now(), Date.now()); // the current year first: it also tells us the earliest/latest dates
  }, [ensureRange]);

  const points = useMemo(() => mergePoints(Object.values(chunks)), [chunks]);
  return { points, meta, loading: pending > 0, error, truncated, ensureRange, refresh, retry, hasLoaded: meta !== null };
}
