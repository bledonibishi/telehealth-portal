'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@apollo/client';
import { CHECK_IN_BY_TOKEN, SUBMIT_CHECK_IN } from '@/graphql/checkin';

const PROGRESS_OPTIONS = ['Great', 'Good', 'No noticeable change', 'Getting worse'];

function CheckInForm({ token }: { token: string }) {
  const { data, loading, error } = useQuery(CHECK_IN_BY_TOKEN, { variables: { token } });
  const [submitCheckIn, { loading: submitting, error: submitError, data: submitData }] = useMutation(SUBMIT_CHECK_IN);

  const [progress, setProgress] = useState('');
  const [sideEffects, setSideEffects] = useState('');
  const [wantsToReorder, setWantsToReorder] = useState<boolean | null>(null);

  if (loading) return <p className="text-sm text-slate-400 text-center py-12">Loading…</p>;

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
        <p className="text-danger-500 font-medium">{error.message}</p>
        <p className="text-sm text-slate-400 mt-2">
          If you think this is a mistake, sign in to your account and your care team will be in touch.
        </p>
      </div>
    );
  }

  if (submitData) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-xl mx-auto mb-4">✓</div>
        <h1 className="text-lg font-semibold text-slate-900">Thanks — you're all set</h1>
        <p className="text-sm text-slate-500 mt-2">Your care team will review your check-in.</p>
      </div>
    );
  }

  const checkIn = data?.checkInByToken;
  const canSubmit = !!progress && wantsToReorder !== null;

  const handleSubmit = () => {
    if (!canSubmit) return;
    submitCheckIn({
      variables: {
        token,
        input: {
          answers: [
            { questionId: 'progress', question: 'How’s your progress been since starting treatment?', answer: progress },
            { questionId: 'side_effects', question: 'Have you experienced any side effects?', answer: sideEffects || 'None reported' },
          ],
          wantsToReorder,
        },
      },
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6">
      <h1 className="text-xl font-bold text-slate-900">
        Hi {checkIn?.patientFirstName ?? 'there'}, let&rsquo;s check in
      </h1>
      <p className="text-sm text-slate-500 mt-2">
        A quick 3-question update helps your clinician keep your treatment on track.
      </p>

      <div className="mt-6 space-y-6">
        <div>
          <p className="text-sm font-medium text-slate-800 mb-2">How&rsquo;s your progress been since starting treatment?</p>
          <div className="space-y-2">
            {PROGRESS_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setProgress(opt)}
                className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                  progress === opt ? 'border-brand-500 bg-brand-50 text-brand-900 font-medium' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-800 mb-2">Have you experienced any side effects?</p>
          <textarea
            rows={3}
            placeholder="None, or describe briefly…"
            value={sideEffects}
            onChange={(e) => setSideEffects(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <p className="text-sm font-medium text-slate-800 mb-2">Would you like to continue and reorder your prescription?</p>
          <div className="flex gap-2">
            {[true, false].map((val) => (
              <button
                key={String(val)}
                onClick={() => setWantsToReorder(val)}
                className={`flex-1 px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                  wantsToReorder === val ? 'border-brand-500 bg-brand-50 text-brand-900 font-medium' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                {val ? 'Yes, reorder' : 'No, not right now'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {submitError && <p className="text-sm text-danger-500 mt-4">{submitError.message}</p>}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        className="w-full mt-6 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
      >
        {submitting ? 'Submitting…' : 'Submit check-in'}
      </button>
    </div>
  );
}

export default function CheckInPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <span className="font-bold text-xl text-slate-900 tracking-tight">telehealth</span>
        </div>
        <Suspense fallback={<p className="text-sm text-slate-400 text-center py-12">Loading…</p>}>
          <CheckInPageInner />
        </Suspense>
      </div>
    </div>
  );
}

function CheckInPageInner() {
  const params = useSearchParams();
  const token = params.get('token');

  if (!token) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
        <p className="text-danger-500 font-medium">Missing check-in link</p>
        <p className="text-sm text-slate-400 mt-2">Please use the link from your check-in email.</p>
      </div>
    );
  }

  return <CheckInForm token={token} />;
}
