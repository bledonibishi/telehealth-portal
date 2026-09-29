'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery } from '@apollo/client';
import { ME_DELIVERY, UPDATE_MY_DELIVERY_DETAILS } from '@/graphql/patient';

const FIELDS = [
  { key: 'phone', label: 'Phone number', hint: 'The courier may call you — medicines need a signature', required: true, type: 'tel' },
  { key: 'addressLine1', label: 'Address', required: true },
  { key: 'addressLine2', label: 'Apartment, floor (optional)', required: false },
  { key: 'city', label: 'City', required: true },
  { key: 'postcode', label: 'Postcode', required: true },
  { key: 'country', label: 'Country', required: true },
] as const;

type Form = Record<(typeof FIELDS)[number]['key'], string>;

export default function DeliveryStepPage() {
  const router = useRouter();
  const { data } = useQuery(ME_DELIVERY);
  const [form, setForm] = useState<Form>({ phone: '', addressLine1: '', addressLine2: '', city: '', postcode: '', country: 'Kosovo' });
  const [error, setError] = useState('');
  const [save, { loading }] = useMutation(UPDATE_MY_DELIVERY_DETAILS, {
    refetchQueries: [{ query: ME_DELIVERY }],
    onCompleted: () => router.push('/onboarding'),
    onError: (e) => setError(e.message),
  });

  useEffect(() => {
    const me = data?.me;
    if (!me) return;
    setForm((f) => ({
      phone: me.phone ?? f.phone,
      addressLine1: me.addressLine1 ?? f.addressLine1,
      addressLine2: me.addressLine2 ?? f.addressLine2,
      city: me.city ?? f.city,
      postcode: me.postcode ?? f.postcode,
      country: me.country ?? f.country,
    }));
  }, [data?.me]);

  const complete = FIELDS.every((f) => !f.required || form[f.key].trim());

  return (
    <div>
      <Link href="/onboarding" className="text-sm text-slate-400 hover:text-slate-600">← Back</Link>

      <h1 className="text-xl font-bold text-slate-900 mt-4">Delivery address</h1>
      <p className="text-sm text-slate-500 mt-2">Where our pharmacy should send your treatment.</p>

      <form
        className="mt-6 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!complete) return;
          setError('');
          save({ variables: { input: { ...form, addressLine2: form.addressLine2.trim() || null } } });
        }}
      >
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="block text-sm font-medium text-slate-900 mb-1">{f.label}</span>
            <input
              type={'type' in f ? f.type : 'text'}
              required={f.required}
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            />
            {'hint' in f && <span className="block text-xs text-slate-400 mt-1">{f.hint}</span>}
          </label>
        ))}

        {error && <div className="bg-danger-50 border border-danger-100 text-danger-500 rounded-xl px-4 py-3 text-sm">{error}</div>}

        <button
          type="submit"
          disabled={!complete || loading}
          className="w-full mt-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
        >
          {loading ? 'Saving…' : 'Save address'}
        </button>
      </form>
    </div>
  );
}
