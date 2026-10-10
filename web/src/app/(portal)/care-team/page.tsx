'use client';

import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { format } from 'date-fns';
import { MY_APPOINTMENTS, MY_CARE_TEAM } from '@/graphql/portal';
import { CONTACT, EMERGENCY_NUMBER } from '@/lib/contact';
import { Card, btnBlue, btnSoft } from '@/components/portal/Card';
import { PageHeader } from '@/components/portal/PageHeader';
import { Avatar, Icon } from '@/components/portal/Icon';

type Member = { id: string; name: string; role: string; licensingBody?: string | null; primary: boolean; involvement: string; since: string; specialty?: string | null; bio?: string | null; languages: string[] };
type Appointment = { id: string; reason: string; status: string; scheduledFor?: string | null; createdAt: string; clinicianName?: string | null; clinicianNote?: string | null };

const REASON_LABEL: Record<string, string> = { QUESTION: 'A question', CHECK_UP: 'Check-up', SIDE_EFFECT: 'Side effect', PAIN: 'Pain', DOSE_CHANGE: 'Dose change', OTHER: 'Something else' };
const RECENT_APPOINTMENTS = 3;

const split = (name: string) => name.replace(/^Dr\.\s+/, '').split(' ');

/** Who is looking after the patient, with their main doctor first, and the two ways to reach them. */
export default function CareTeamPage() {
  const { data, loading } = useQuery(MY_CARE_TEAM, { fetchPolicy: 'cache-and-network' });
  const team: Member[] = data?.myCareTeam ?? [];
  const { data: apptData } = useQuery(MY_APPOINTMENTS, { fetchPolicy: 'cache-and-network' });
  const recent: Appointment[] = ((apptData?.myAppointments ?? []) as Appointment[])
    .filter((a) => a.status === 'COMPLETED')
    .sort((a, b) => (b.scheduledFor ?? b.createdAt).localeCompare(a.scheduledFor ?? a.createdAt))
    .slice(0, RECENT_APPOINTMENTS);
  const lead = team.find((m) => m.primary);
  const others = team.filter((m) => !m.primary);

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-8 max-w-4xl">
      <PageHeader title="My Doctor" subtitle="The clinicians looking after your treatment." />

      {loading && !team.length && <Card><div className="h-24 rounded-md bg-slate-50 animate-pulse" /></Card>}
      {!loading && !team.length && (
        <Card>
          <p className="text-sm text-slate-600">A doctor is assigned when your consultation is reviewed. You can already message our team with any question.</p>
          <Link href="/messages" className={`${btnBlue} mt-4`}><Icon name="chat" className="w-4 h-4" /> Open Messages</Link>
        </Card>
      )}

      {lead && (
        <Card className="mb-5">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar first={split(lead.name)[0]} last={split(lead.name)[1]} className="w-20 h-20 text-2xl" />
            <div className="min-w-0 flex-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-50 text-ink-800 text-xs font-semibold px-2.5 py-1"><Icon name="heart" className="w-3.5 h-3.5" /> Your main doctor</span>
              <h2 className="text-xl font-bold text-ink-900 mt-2">{lead.name}</h2>
              <p className="text-sm text-slate-500">{[lead.specialty ?? lead.role, lead.licensingBody ? `registered with ${lead.licensingBody}` : null].filter(Boolean).join(' · ')}</p>
              <p className="text-xs text-slate-500 mt-1">{lead.involvement} · with you since {format(new Date(lead.since), 'MMMM yyyy')}</p>
            </div>
          </div>
          {lead.bio && <p className="text-sm text-slate-600 mt-4">{lead.bio}</p>}
          {(lead.languages.length > 0 || CONTACT.phoneHours) && (
            <dl className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
              {lead.languages.length > 0 && (<div className="flex gap-1.5"><dt className="text-slate-400">Speaks</dt><dd className="text-slate-700">{lead.languages.join(', ')}</dd></div>)}
              {CONTACT.phoneHours && (<div className="flex gap-1.5"><dt className="text-slate-400">Care team hours</dt><dd className="text-slate-700">{CONTACT.phoneHours}</dd></div>)}
            </dl>
          )}
          <div className="grid sm:grid-cols-2 gap-3 mt-5">
            <Link href="/messages" className={btnBlue}><Icon name="chat" className="w-4 h-4" /> Send a message</Link>
            <Link href="/appointments?new=1" className={btnSoft}><Icon name="calendar" className="w-4 h-4" /> Book an appointment</Link>
          </div>
        </Card>
      )}

      {others.length > 0 && (
        <Card className="mb-5">
          <h2 className="text-base font-semibold text-ink-900 mb-3">{lead ? 'Also on your care team' : 'Your care team'}</h2>
          <ul className="divide-y divide-slate-100">
            {others.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Avatar first={split(m.name)[0]} last={split(m.name)[1]} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">{m.name}</p>
                  <p className="text-xs text-slate-500">{m.specialty ?? m.role} · {m.involvement}</p>
                  {m.languages.length > 0 && <p className="text-xs text-slate-400">Speaks {m.languages.join(', ')}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {recent.length > 0 && (
        <Card className="mb-5" labelledBy="recent-appointments">
          <div className="flex items-center justify-between mb-3">
            <h2 id="recent-appointments" className="text-base font-semibold text-ink-900">Recent appointments</h2>
            <Link href="/appointments" className="text-xs font-medium text-ink-600 hover:text-ink-800">All appointments</Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {recent.map((a) => (
              <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-semibold text-ink-900">
                  {REASON_LABEL[a.reason] ?? a.reason} <span className="font-normal text-slate-500">· {format(new Date(a.scheduledFor ?? a.createdAt), 'd MMMM yyyy')}{a.clinicianName ? ` · ${a.clinicianName}` : ''}</span>
                </p>
                {a.clinicianNote && <p className="text-sm text-slate-600 mt-0.5 line-clamp-2">{a.clinicianNote}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="rounded-lg bg-amber-50 border border-amber-100 p-4 flex gap-3">
        <Icon name="alert" className="w-5 h-5 text-amber-600 flex-shrink-0" />
        <p className="text-sm text-amber-900">Messages are read by your care team during working hours and are <b>not for emergencies</b>. For chest pain, trouble breathing or severe stomach pain, call {EMERGENCY_NUMBER}.</p>
      </div>
    </div>
  );
}
