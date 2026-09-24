import Link from 'next/link';

export default function CancelPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
        <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-slate-400" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 18L18 6M6 6l12 12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-3">Payment cancelled</h1>
        <p className="text-slate-500 mb-8">
          No charge was made. You can go back and try again whenever you're ready.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            Back to home
          </Link>
          <Link
            href="/select"
            className="inline-flex items-center justify-center border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium px-6 py-3 rounded-xl transition-colors"
          >
            View plans again
          </Link>
        </div>
      </div>
    </div>
  );
}
