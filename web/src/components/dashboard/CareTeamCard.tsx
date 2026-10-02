'use client';

import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { formatDistanceToNowStrict } from 'date-fns';
import { MY_CONVERSATION } from '@/graphql/messaging';

type Message = { id: string; senderRole: string; content: string; sentAt: string };

/** The latest thing said between the patient and their care team, so a reply never sits unnoticed. */
export function CareTeamCard() {
  const { data } = useQuery(MY_CONVERSATION, { fetchPolicy: 'cache-and-network', pollInterval: 60_000 });
  const all: Message[] = (data?.myConsultations ?? []).flatMap((c: any) => c.messages ?? []);
  const last = all.length ? all.reduce((a, b) => (Date.parse(b.sentAt) > Date.parse(a.sentAt) ? b : a)) : null;
  const fromTeam = last && last.senderRole !== 'PATIENT';

  return (
    <section className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5" aria-labelledby="team-title">
      <div className="flex items-center justify-between mb-3">
        <h2 id="team-title" className="text-xs font-semibold text-brand-700 uppercase tracking-wide">Your care team</h2>
        <Link href="/messages" className="text-xs font-medium text-brand-600 hover:text-brand-700">Open chat →</Link>
      </div>
      {last ? (
        <>
          <p className="text-xs text-slate-400">
            {fromTeam ? <span className="inline-flex items-center gap-1.5 font-semibold text-brand-700"><span className="w-1.5 h-1.5 rounded-full bg-brand-600" />Reply from your clinician</span> : 'You wrote'} · {formatDistanceToNowStrict(new Date(last.sentAt))} ago
          </p>
          <p className="text-sm text-slate-700 mt-1 line-clamp-3">“{last.content}”</p>
        </>
      ) : (
        <p className="text-sm text-slate-500">Questions about your treatment? Message your clinician any time — no appointment needed.</p>
      )}
    </section>
  );
}
