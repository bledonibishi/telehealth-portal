'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery } from '@apollo/client';
import { ME_BASIC_INFO, UPDATE_MY_BASIC_INFO } from '@/graphql/patient';
import { InlineError } from '@/components/common/Alert';

const ADDRESS_FIELDS = [
  { key: 'phone', label: 'Phone number', hint: 'The courier may call you — medicines need a signature', type: 'tel' },
  { key: 'addressLine1', label: 'Address' },
  { key: 'addressLine2', label: 'Apartment, floor (optional)', optional: true },
  { key: 'city', label: 'City' },
  { key: 'postcode', label: 'Postcode' },
  { key: 'country', label: 'Country' },
] as const;

type AddressKey = (typeof ADDRESS_FIELDS)[number]['key'];
type Form = { firstName: string; lastName: string; dateOfBirth: string } & Record<AddressKey, string>;

const EMPTY: Form = {
  firstName: '', lastName: '', dateOfBirth: '',
  phone: '', addressLine1: '', addressLine2: '', city: '', postcode: '', country: 'Kosovo',
};

const inputCls = 'w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ink-500 bg-white';
const labelCls = 'block text-sm font-medium text-slate-900 mb-1';

function toDateInputValue(iso?: string | null) {
  if (!iso) return '';
  return iso.slice(0, 10);
}

export default function BasicInformationStepPage() {
  const router = useRouter();
  const { data } = useQuery(ME_BASIC_INFO);
  const [form, setForm] = useState<Form>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [save, { loading }] = useMutation(UPDATE_MY_BASIC_INFO, {
    refetchQueries: [{ query: ME_BASIC_INFO }],
    onCompleted: () => router.push('/onboarding'),
    onError: (e) => setError(e),
  });

  // Pre-filled from checkout (name) and the placeholder set at account
  // creation (date of birth) — the patient confirms or corrects them here,
  // and fills in the delivery address, which checkout never asked for.
  useEffect(() => {
    if (touched) return;
    const me = data?.me;
    if (!me) return;
    setForm({
      firstName: me.firstName ?? '',
      lastName: me.lastName ?? '',
      dateOfBirth: toDateInputValue(me.dateOfBirth),
      phone: me.phone ?? '',
      addressLine1: me.addressLine1 ?? '',
      addressLine2: me.addressLine2 ?? '',
      city: me.city ?? '',
      postcode: me.postcode ?? '',
      country: me.country ?? 'Kosovo',
    });
  }, [data?.me, touched]);

  const set = (key: keyof Form, value: string) => {
    setTouched(true);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const complete =
    !!form.firstName.trim() && !!form.lastName.trim() && !!form.dateOfBirth &&
    ADDRESS_FIELDS.every((f) => ('optional' in f && f.optional) || form[f.key].trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!complete) return;
    setError(null);
    save({
      variables: {
        input: {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          dateOfBirth: form.dateOfBirth,
          phone: form.phone.trim(),
          addressLine1: form.addressLine1.trim(),
          addressLine2: form.addressLine2.trim() || null,
          city: form.city.trim(),
          postcode: form.postcode.trim(),
          country: form.country.trim(),
        },
      },
    });
  };

  return (
    <div>
      <Link href="/onboarding" className="text-sm text-slate-400 hover:text-slate-600">← Back</Link>

      <h1 className="text-xl font-bold text-slate-900 mt-4">Your details</h1>
      <p className="text-sm text-slate-500 mt-2">Check your details so we identify you correctly and send your order to the right place.</p>
      <p className="text-xs text-slate-400 mt-1">Your answers save as you go, so you can leave and come back.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div className="bg-white rounded-lg border border-slate-100 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Personal details</p>
          <label className="block">
            <span className={labelCls}>First name</span>
            <input required value={form.firstName} onChange={(e) => set('firstName', e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Last name</span>
            <input required value={form.lastName} onChange={(e) => set('lastName', e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Date of birth</span>
            <input
              type="date"
              required
              value={form.dateOfBirth}
              onChange={(e) => set('dateOfBirth', e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className={inputCls}
            />
          </label>
        </div>

        <div className="bg-white rounded-lg border border-slate-100 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Delivery address</p>
          {ADDRESS_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className={labelCls}>{f.label}</span>
              <input
                type={'type' in f ? f.type : 'text'}
                required={!('optional' in f && f.optional)}
                value={form[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                className={inputCls}
              />
              {'hint' in f && <span className="block text-xs text-slate-400 mt-1">{f.hint}</span>}
            </label>
          ))}
        </div>

        <InlineError error={error} className="px-4 py-3" />

        <button
          type="submit"
          disabled={!complete || loading}
          className="w-full bg-ink-700 hover:bg-ink-800 disabled:opacity-40 text-white font-semibold py-3 rounded-md text-sm transition-colors"
        >
          {loading ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
