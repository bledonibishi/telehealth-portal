'use client';

import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { MY_WEIGHT_TREND } from '@/graphql/weight';
import { trendMessage, type TrendTone } from '@/lib/weight-trend';

const TONE: Record<TrendTone, string> = {
  red: 'bg-red-50 border-red-200 text-red-900',
  orange: 'bg-amber-50 border-amber-200 text-amber-900',
  green: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  gray: 'bg-slate-50 border-slate-200 text-slate-700',
};

/** One line on what the recent weights say, in the colour that fits: red for a rise, green for a steady loss. */
export function WeightTrendNotice() {
  const { data } = useQuery(MY_WEIGHT_TREND, { fetchPolicy: 'cache-and-network' });
  const message = data?.myWeightTrend ? trendMessage(data.myWeightTrend) : null;
  if (!message) return null;
  return (
    <section className={`rounded-2xl border p-4 ${TONE[message.tone]}`} aria-label="What your recent weights say" role={message.tone === 'red' ? 'alert' : 'status'}>
      <p className="text-sm font-semibold"><span aria-hidden>{message.icon}</span> {message.title}</p>
      <p className="text-sm mt-1 opacity-90">{message.text}</p>
      {message.action === 'MESSAGE_DOCTOR' && <Link href="/messages" className="inline-block mt-2 text-sm font-semibold underline">Message my doctor</Link>}
    </section>
  );
}
