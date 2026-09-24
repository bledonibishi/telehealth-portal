'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Plan } from '@/data/products';

export function PlanCard({ plan }: { plan: Plan }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSelect = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: plan.stripePriceId, planName: plan.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
      router.push(data.url);
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div
      className={`relative rounded-2xl border-2 p-8 flex flex-col ${
        plan.popular ? 'border-brand-500 shadow-lg' : 'border-slate-200'
      }`}
    >
      {plan.popular && (
        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-xs font-bold px-4 py-1 rounded-full tracking-wide uppercase">
          Most popular
        </span>
      )}

      <div className="mb-6">
        <h3 className="text-xl font-bold text-slate-900 mb-1">{plan.name}</h3>
        <p className="text-sm text-slate-500 leading-relaxed">{plan.tagline}</p>
      </div>

      <div className="mb-6">
        <span className="text-4xl font-extrabold text-slate-900">£{plan.price}</span>
        <span className="text-slate-400 text-sm ml-1">/ {plan.interval}</span>
      </div>

      <ul className="space-y-2.5 mb-8 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm text-slate-700">
            <span className="mt-0.5 w-4 h-4 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0">
              <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                <path
                  d="M1.5 5l2.5 2.5 4.5-4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            {f}
          </li>
        ))}
      </ul>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      <button
        onClick={handleSelect}
        disabled={loading}
        className={`w-full py-3.5 rounded-xl font-semibold text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
          plan.popular
            ? 'bg-brand-600 hover:bg-brand-700'
            : 'bg-slate-800 hover:bg-slate-900'
        }`}
      >
        {loading ? 'Redirecting…' : 'Select plan →'}
      </button>
    </div>
  );
}
