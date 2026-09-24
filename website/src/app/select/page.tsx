import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PLANS } from '@/data/products';
import { PlanCard } from '@/components/select/PlanCard';
import type { ProductKey } from '@/data/questions';

const PRODUCT_LABELS: Record<ProductKey, { title: string; subtitle: string }> = {
  hrt: {
    title: 'Choose your HRT plan',
    subtitle: 'All plans include a prescription review by a GMC-registered clinician.',
  },
  glp1: {
    title: 'Choose your GLP-1 plan',
    subtitle: 'All plans include clinical supervision and free UK delivery.',
  },
};

export default function SelectPage({ searchParams }: { searchParams: { product?: string } }) {
  const product = searchParams.product as ProductKey;

  if (product !== 'hrt' && product !== 'glp1') {
    redirect('/');
  }

  const plans = PLANS[product];
  const { title, subtitle } = PRODUCT_LABELS[product];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg text-slate-900 tracking-tight">
            telehealth
          </Link>
          <Link
            href={`/quiz?product=${product}`}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ← Retake quiz
          </Link>
        </div>
      </header>

      <main className="flex-1 py-16 px-6">
        <div className="max-w-4xl mx-auto">
          {/* Eligibility badge */}
          <div className="flex justify-center mb-10">
            <span className="inline-flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm font-medium px-5 py-2.5 rounded-full">
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 8l3.5 3.5L13 4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Eligibility confirmed
            </span>
          </div>

          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-slate-900 mb-3">{title}</h1>
            <p className="text-lg text-slate-500">{subtitle}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>

          <p className="text-center text-xs text-slate-400 mt-8">
            Subscriptions can be cancelled at any time. A clinician reviews every order before
            dispatch — if treatment is not clinically appropriate you will receive a full refund.
          </p>
        </div>
      </main>
    </div>
  );
}
