'use client';

import Link from 'next/link';
import { differenceInYears, format } from 'date-fns';
import { useQuery } from '@apollo/client';
import { MY_PROFILE } from '@/graphql/portal';
import { kg } from '@/lib/weight';
import { Card, btnSoft } from '@/components/portal/Card';
import { Avatar, Icon, type IconName } from '@/components/portal/Icon';

export const GENDER_LABEL: Record<string, string> = { FEMALE: 'Female', MALE: 'Male', OTHER: 'Other', PREFER_NOT_TO_SAY: 'Prefer not to say' };

function Row({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5 text-sm">
      <Icon name={icon} className="w-4 h-4 text-ink-800 flex-shrink-0" />
      <dt className="w-28 text-slate-500 flex-shrink-0">{label}</dt>
      <dd className="text-ink-900 min-w-0 truncate">{value}</dd>
    </div>
  );
}

/** Who the patient is and their body details at a glance, with a way to correct them. */
export function ProfileSummaryCard({ journey }: { journey?: any }) {
  const { data } = useQuery(MY_PROFILE, { fetchPolicy: 'cache-and-network' });
  const p = data?.myProfile;
  if (!p) return <Card><div className="h-64 rounded-md bg-slate-50 animate-pulse" /></Card>;
  const dob = new Date(p.dateOfBirth);
  return (
    <Card labelledBy="profile-title">
      <div className="flex items-center gap-4">
        <Avatar first={p.firstName} last={p.lastName} className="w-16 h-16 text-xl" />
        <div className="min-w-0">
          <h2 id="profile-title" className="text-lg font-bold text-ink-900 truncate">{p.firstName} {p.lastName}</h2>
          {p.verified && <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold px-2.5 py-1 mt-1"><Icon name="shield" className="w-3.5 h-3.5" /> Verified Patient</span>}
        </div>
      </div>
      <dl className="mt-4">
        <Row icon="mail" label="Email" value={p.email} />
        <Row icon="calendar" label="Date of Birth" value={`${format(dob, 'd MMM yyyy')} (${differenceInYears(new Date(), dob)} years)`} />
        <Row icon="user" label="Gender" value={p.gender ? GENDER_LABEL[p.gender] : 'Not set'} />
        <Row icon="chart" label="Height" value={p.heightCm ? `${Math.round(p.heightCm)} cm` : 'Not set'} />
        <Row icon="scale" label="Current Weight" value={kg(journey?.currentWeightKg)} />
        <Row icon="heart" label="Target Weight" value={journey?.targetWeightKg ? kg(journey.targetWeightKg) : 'Not set'} />
      </dl>
      <Link href="/profile" className={`${btnSoft} w-full mt-4`}><Icon name="pencil" className="w-4 h-4" /> Edit Profile</Link>
    </Card>
  );
}
