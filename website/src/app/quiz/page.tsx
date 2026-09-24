import { redirect } from 'next/navigation';
import Link from 'next/link';
import { QuizShell } from '@/components/quiz/QuizShell';
import type { ProductKey } from '@/data/questions';

const PRODUCT_LABELS: Record<ProductKey, string> = {
  hrt: 'HRT Eligibility Quiz',
  glp1: 'GLP-1 Eligibility Quiz',
};

export default function QuizPage({ searchParams }: { searchParams: { product?: string } }) {
  const product = searchParams.product as ProductKey;

  if (product !== 'hrt' && product !== 'glp1') {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-100">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg text-slate-900 tracking-tight">
            telehealth
          </Link>
          <span className="text-sm text-slate-500">{PRODUCT_LABELS[product]}</span>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-6 py-16">
        <div className="w-full max-w-xl bg-white rounded-2xl shadow-sm border border-slate-100 p-8 md:p-10">
          <div className="mb-8">
            <span className="text-xs font-semibold tracking-widest uppercase text-brand-600">
              {PRODUCT_LABELS[product]}
            </span>
            <p className="text-sm text-slate-400 mt-1">
              This is a self-assessment only and does not constitute medical advice.
            </p>
          </div>
          <QuizShell product={product} />
        </div>
      </main>
    </div>
  );
}
