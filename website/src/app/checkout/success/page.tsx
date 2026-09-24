import Link from 'next/link';

export default function SuccessPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-600" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 13l4 4L19 7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-3">Order confirmed</h1>
        <p className="text-slate-500 mb-8 leading-relaxed">
          Thank you for your order. A GMC-registered clinician will review your case within 24 hours.
          You'll receive an email confirmation shortly.
        </p>
        <div className="bg-slate-50 rounded-xl p-5 text-sm text-slate-600 text-left space-y-2 mb-8">
          <p className="font-semibold text-slate-800">What happens next?</p>
          <p>1. Clinician reviews your quiz answers and medical history.</p>
          <p>2. If approved, a prescription is issued and dispatched.</p>
          <p>3. You'll receive a tracking number by email.</p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center bg-brand-600 hover:bg-brand-700 text-white font-semibold px-7 py-3 rounded-xl transition-colors"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
