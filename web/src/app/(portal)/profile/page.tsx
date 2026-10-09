'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { differenceInYears, format } from 'date-fns';
import { MY_PROFILE, UPDATE_MY_PROFILE } from '@/graphql/portal';
import { UPDATE_MY_BASIC_INFO } from '@/graphql/patient';
import { MY_WEIGHT_JOURNEY } from '@/graphql/weight';
import { kg } from '@/lib/weight';
import { TargetWeightForm } from '@/components/weight/TargetWeightForm';
import { GENDER_LABEL } from '@/components/home/ProfileSummaryCard';
import { Dialog } from '@/components/common/Dialog';
import { Card, CardHeader, btnPrimary, btnSoft } from '@/components/portal/Card';
import { PageHeader } from '@/components/portal/PageHeader';
import { Avatar, Icon } from '@/components/portal/Icon';
import { InlineError } from '@/components/common/Alert';

const field = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ink-600';
const label = 'block text-xs font-medium text-slate-500 mb-1';

function Item({ name, value, hint }: { name: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="py-3 border-b border-slate-100 last:border-0">
      <dt className="text-xs text-slate-500">{name}</dt>
      <dd className="text-sm font-medium text-ink-900 mt-0.5">{value}</dd>
      {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

/** Gender, height and phone: the details a patient keeps up to date themselves. */
function BodyForm({ p, onDone }: { p: any; onDone: () => void }) {
  const [gender, setGender] = useState<string>(p.gender ?? '');
  const [height, setHeight] = useState(p.heightCm ? String(Math.round(p.heightCm)) : '');
  const [phone, setPhone] = useState(p.phone ?? '');
  const [save, { loading, error }] = useMutation(UPDATE_MY_PROFILE, { refetchQueries: [{ query: MY_PROFILE }] });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: Record<string, unknown> = {};
    if (gender && gender !== p.gender) input.gender = gender;
    if (height && Number(height) !== Math.round(p.heightCm ?? 0)) input.heightCm = Number(height);
    if (phone.trim() !== (p.phone ?? '')) input.phone = phone.trim();
    try {
      if (Object.keys(input).length) await save({ variables: { input } });
      onDone();
    } catch { /* shown from `error` */ }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="gender" className={label}>Gender</label>
        <select id="gender" value={gender} onChange={(e) => setGender(e.target.value)} className={field}>
          <option value="" disabled>Choose…</option>
          {Object.entries(GENDER_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="height" className={label}>Height (cm)</label>
        <input id="height" type="number" inputMode="numeric" min={120} max={230} value={height} onChange={(e) => setHeight(e.target.value)} className={field} />
      </div>
      <div>
        <label htmlFor="phone" className={label}>Phone</label>
        <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={field} autoComplete="tel" />
      </div>
      <InlineError error={error} />
      <div className="flex gap-3">
        <button type="submit" disabled={loading} className={btnPrimary}>{loading ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={onDone} className="text-sm text-slate-500">Cancel</button>
      </div>
    </form>
  );
}

/** Allergies and who to call: what the patient wants their care team to have at hand. */
function MedicalForm({ p, onDone }: { p: any; onDone: () => void }) {
  const [allergies, setAllergies] = useState(p.allergies ?? '');
  const [name, setName] = useState(p.emergencyContactName ?? '');
  const [phone, setPhone] = useState(p.emergencyContactPhone ?? '');
  const [save, { loading, error }] = useMutation(UPDATE_MY_PROFILE, { refetchQueries: [{ query: MY_PROFILE }] });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await save({ variables: { input: { allergies, emergencyContactName: name, emergencyContactPhone: phone } } });
      onDone();
    } catch { /* shown from `error` */ }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="allergies" className={label}>Allergies</label>
        <textarea id="allergies" rows={3} maxLength={500} value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="e.g. penicillin, latex — or leave empty if none" className={field} />
        <p className="text-[11px] text-slate-400 mt-1">Your doctor prescribes from your medical questionnaire. If an allergy is new, message them as well.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label htmlFor="ec-name" className={label}>Emergency contact</label><input id="ec-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Name and relation" className={field} /></div>
        <div><label htmlFor="ec-phone" className={label}>Their phone</label><input id="ec-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={field} /></div>
      </div>
      <InlineError error={error} />
      <div className="flex gap-3">
        <button type="submit" disabled={loading} className={btnPrimary}>{loading ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={onDone} className="text-sm text-slate-500">Cancel</button>
      </div>
    </form>
  );
}

/** Where the pharmacy delivers to. Saved with the details confirmed at onboarding. */
function AddressForm({ p, onDone }: { p: any; onDone: () => void }) {
  const [v, setV] = useState({ addressLine1: p.addressLine1 ?? '', addressLine2: p.addressLine2 ?? '', city: p.city ?? '', postcode: p.postcode ?? '', country: p.country ?? '' });
  const [save, { loading, error }] = useMutation(UPDATE_MY_BASIC_INFO, { refetchQueries: [{ query: MY_PROFILE }] });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await save({ variables: { input: { firstName: p.firstName, lastName: p.lastName, dateOfBirth: p.dateOfBirth, phone: p.phone ?? '', ...v, addressLine2: v.addressLine2 || undefined } } });
      onDone();
    } catch { /* shown from `error` */ }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <div><label htmlFor="a1" className={label}>Address</label><input id="a1" value={v.addressLine1} onChange={set('addressLine1')} className={field} autoComplete="address-line1" /></div>
      <div><label htmlFor="a2" className={label}>Address line 2 (optional)</label><input id="a2" value={v.addressLine2} onChange={set('addressLine2')} className={field} autoComplete="address-line2" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label htmlFor="city" className={label}>City</label><input id="city" value={v.city} onChange={set('city')} className={field} autoComplete="address-level2" /></div>
        <div><label htmlFor="pc" className={label}>Postcode</label><input id="pc" value={v.postcode} onChange={set('postcode')} className={field} autoComplete="postal-code" /></div>
      </div>
      <div><label htmlFor="country" className={label}>Country</label><input id="country" value={v.country} onChange={set('country')} className={field} autoComplete="country-name" /></div>
      {!p.phone && <p className="text-xs text-amber-700">Add your phone number under “Body & contact” first — the pharmacy needs it.</p>}
      <InlineError error={error} />
      <div className="flex gap-3">
        <button type="submit" disabled={loading} className={btnPrimary}>{loading ? 'Saving…' : 'Save address'}</button>
        <button type="button" onClick={onDone} className="text-sm text-slate-500">Cancel</button>
      </div>
    </form>
  );
}

export default function ProfilePage() {
  const { data, loading } = useQuery(MY_PROFILE, { fetchPolicy: 'cache-and-network' });
  const { data: jData } = useQuery(MY_WEIGHT_JOURNEY, { fetchPolicy: 'cache-and-network' });
  const [editing, setEditing] = useState<'body' | 'address' | 'target' | 'medical' | null>(null);
  const p = data?.myProfile;
  const j = jData?.myWeightJourney;

  if (!p) return <div className="px-4 sm:px-6 lg:px-8"><PageHeader title="Profile" /><Card><p className="text-sm text-slate-400">{loading ? 'Loading…' : 'Couldn’t load your profile.'}</p></Card></div>;

  const dob = new Date(p.dateOfBirth);
  const bmi = p.heightCm && j?.currentWeightKg ? Math.round((j.currentWeightKg / (p.heightCm / 100) ** 2) * 10) / 10 : null;
  const address = [p.addressLine1, p.addressLine2, [p.postcode, p.city].filter(Boolean).join(' '), p.country].filter(Boolean).join(', ');

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-8 max-w-5xl">
      <PageHeader title="Profile" subtitle="Your personal, body and delivery details." />

      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar first={p.firstName} last={p.lastName} className="w-16 h-16 text-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-xl font-bold text-ink-900">{p.firstName} {p.lastName}</p>
            <p className="text-sm text-slate-500">Patient ID: {p.patientNumber}{p.memberSince ? ` · member since ${format(new Date(p.memberSince), 'MMMM yyyy')}` : ''}</p>
          </div>
          {p.verified && <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1.5"><Icon name="shield" className="w-4 h-4" /> Verified Patient</span>}
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <Card>
          <CardHeader title="Personal details" subtitle="Confirmed with your ID — message us to change them." />
          <dl>
            <Item name="Full name" value={`${p.firstName} ${p.lastName}`} />
            <Item name="Email" value={p.email} hint="Used to sign in and for updates about your treatment." />
            <Item name="Date of birth" value={`${format(dob, 'd MMMM yyyy')} (${differenceInYears(new Date(), dob)} years)`} />
          </dl>
        </Card>

        <Card>
          <CardHeader title="Body & contact">
            <button type="button" onClick={() => setEditing('body')} className={`${btnSoft} !py-1.5 !px-3 !text-xs`}><Icon name="pencil" className="w-3.5 h-3.5" /> Edit</button>
          </CardHeader>
          <dl>
            <Item name="Gender" value={p.gender ? GENDER_LABEL[p.gender] : 'Not set'} />
            <Item name="Height" value={p.heightCm ? `${Math.round(p.heightCm)} cm` : 'Not set'} hint={p.heightFromIntake ? 'From your medical questionnaire' : undefined} />
            <Item name="Phone" value={p.phone ?? 'Not set'} />
          </dl>
        </Card>

        <Card>
          <CardHeader title="Weight" href="/weight-journey" action="Weight journey →" />
          <dl className="grid grid-cols-2 gap-x-6">
            <Item name="Starting weight" value={kg(j?.startingWeightKg)} />
            <Item name="Current weight" value={kg(j?.currentWeightKg)} />
            <Item name="Target weight" value={<>{j?.targetWeightKg ? kg(j.targetWeightKg) : 'Not set'}{j?.startingWeightKg && <button type="button" onClick={() => setEditing('target')} className="ml-2 text-xs font-medium text-ink-600">{j?.targetWeightKg ? 'Change' : 'Set'}</button>}</>} />
            <Item name="BMI" value={bmi ?? '—'} hint={bmi ? 'From your height and latest weight' : 'Add your height to see it'} />
          </dl>
        </Card>

        <Card>
          <CardHeader title="Medical & emergency">
            <button type="button" onClick={() => setEditing('medical')} className={`${btnSoft} !py-1.5 !px-3 !text-xs`}><Icon name="pencil" className="w-3.5 h-3.5" /> Edit</button>
          </CardHeader>
          <dl>
            <Item name="Allergies" value={p.allergies || 'None noted'} />
            <Item name="Emergency contact" value={p.emergencyContactName ? `${p.emergencyContactName}${p.emergencyContactPhone ? ` · ${p.emergencyContactPhone}` : ''}` : 'Not set'} />
          </dl>
        </Card>

        <Card>
          <CardHeader title="Delivery address">
            <button type="button" onClick={() => setEditing('address')} className={`${btnSoft} !py-1.5 !px-3 !text-xs`}><Icon name="pencil" className="w-3.5 h-3.5" /> Edit</button>
          </CardHeader>
          <p className="text-sm text-ink-900">{address || 'Not set'}</p>
          <p className="text-[11px] text-slate-400 mt-2">Changes apply to supplies that haven’t been dispatched yet.</p>
        </Card>
      </div>

      {editing === 'body' && <Dialog title="Body & contact" onClose={() => setEditing(null)}><BodyForm p={p} onDone={() => setEditing(null)} /></Dialog>}
      {editing === 'address' && <Dialog title="Delivery address" onClose={() => setEditing(null)}><AddressForm p={p} onDone={() => setEditing(null)} /></Dialog>}
      {editing === 'medical' && <Dialog title="Medical & emergency" onClose={() => setEditing(null)}><MedicalForm p={p} onDone={() => setEditing(null)} /></Dialog>}
      {editing === 'target' && <Dialog title="Target weight" onClose={() => setEditing(null)}><TargetWeightForm current={j?.targetWeightKg} currentKg={j?.currentWeightKg} startKg={j?.startingWeightKg} onDone={() => setEditing(null)} /></Dialog>}
    </div>
  );
}
