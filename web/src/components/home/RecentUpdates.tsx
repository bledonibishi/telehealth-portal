'use client';

import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { format } from 'date-fns';
import { MY_PROGRESS_PHOTOS } from '@/graphql/weight';
import { MY_APPOINTMENTS, MY_PRESCRIPTIONS_BRIEF } from '@/graphql/portal';
import { kg, kgChange } from '@/lib/weight';
import { useRecentWeights } from '@/lib/useRecentWeights';
import { useUnreadMessages } from '@/lib/useUnreadMessages';
import { AuthedImage } from '@/components/common/AuthedImage';
import { Card, CardHeader } from '@/components/portal/Card';
import { Icon, type IconName } from '@/components/portal/Icon';

type Update = { key: string; at: number; icon: IconName; tone: string; title: string; detail?: string; href?: string; extra?: React.ReactNode };

/** The latest things that happened on the patient's journey, from their own data, newest first. */
export function RecentUpdates() {
  const { points } = useRecentWeights();
  const { data: photos } = useQuery(MY_PROGRESS_PHOTOS, { fetchPolicy: 'cache-first' });
  const { data: rx } = useQuery(MY_PRESCRIPTIONS_BRIEF, { fetchPolicy: 'cache-and-network' });
  const { data: appts } = useQuery(MY_APPOINTMENTS, { fetchPolicy: 'cache-first' });
  const { messages } = useUnreadMessages();

  const updates: Update[] = [];
  points.forEach((p, i) => {
    const change = i > 0 ? Math.round((p.w - points[i - 1].w) * 10) / 10 : null;
    updates.push({
      key: `w${p.t}`, at: p.t, icon: 'scale', tone: 'bg-ink-50 text-ink-700', title: 'Weight updated', detail: kg(p.w),
      extra: change != null && change !== 0 ? <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${change < 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{kgChange(change)}</span> : undefined,
    });
  });
  for (const p of (photos?.myProgressPhotos ?? []) as any[]) {
    updates.push({ key: `p${p.entryId}`, at: Date.parse(p.measuredAt) + 1, icon: 'camera', tone: 'bg-emerald-50 text-emerald-700', title: 'Photo uploaded', href: '/weight-journey',
      extra: <AuthedImage fileId={p.photoFileId} alt="" className="w-10 h-10 rounded-lg object-cover" /> });
  }
  messages.filter((m) => m.senderRole !== 'PATIENT').forEach((m) => updates.push({ key: `m${m.id}`, at: Date.parse(m.sentAt), icon: 'chat', tone: 'bg-ink-50 text-ink-700', title: 'Message from your care team', detail: m.content, href: '/messages' }));
  for (const r of (rx?.myPrescriptions ?? []) as any[]) {
    updates.push({ key: `r${r.id}`, at: Date.parse(r.issuedAt), icon: 'rx', tone: 'bg-ink-50 text-ink-700', title: 'Prescription confirmed', detail: `${r.medication} ${r.dosage}`.trim(), href: '/prescription' });
  }
  for (const a of (appts?.myAppointments ?? []) as any[]) {
    if (a.status === 'SCHEDULED' && a.scheduledFor) updates.push({ key: `a${a.id}`, at: Date.parse(a.createdAt), icon: 'calendar', tone: 'bg-ink-50 text-ink-700', title: 'Appointment booked', detail: format(new Date(a.scheduledFor), 'EEE d MMM, HH:mm'), href: '/appointments' });
  }
  const latest = updates.sort((a, b) => b.at - a.at).slice(0, 4);

  return (
    <Card labelledBy="updates-title" className="h-full">
      <CardHeader id="updates-title" title="Recent Updates" href="/weight-journey" action="View All" />
      {latest.length === 0 ? (
        <p className="text-sm text-slate-500">Your weigh-ins, photos and messages will show up here.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {latest.map((u) => (
            <li key={u.key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${u.tone}`}><Icon name={u.icon} className="w-4 h-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-slate-400">{format(new Date(u.at), 'd MMM yyyy')}</p>
                <p className="text-sm text-ink-900 truncate">{u.title}</p>
                {u.detail && <p className="text-xs text-slate-500 truncate">{u.detail}</p>}
              </div>
              {u.extra}
              {u.href && !u.extra && <Link href={u.href} className="flex-shrink-0 text-xs font-medium text-ink-600 border border-slate-200 rounded-lg px-2.5 py-1 hover:bg-slate-50">View</Link>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
