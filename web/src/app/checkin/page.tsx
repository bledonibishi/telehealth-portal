'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@apollo/client';
import { CHECK_IN_BY_TOKEN, SUBMIT_CHECK_IN } from '@/graphql/checkin';
import { QUESTIONNAIRE } from '@/graphql/intake';
import { QuestionnaireForm, SubmittedAnswer } from '@/components/intake/QuestionnaireForm';

function CheckInForm({ token }: { token: string }) {
  const { data, loading, error } = useQuery(CHECK_IN_BY_TOKEN, { variables: { token } });
  const kind = data?.checkInByToken?.kind;
  const { data: qData, loading: qLoading } = useQuery(QUESTIONNAIRE, { variables: { kind, stage: 'CHECKIN' }, skip: !kind });
  const [submitCheckIn, { loading: submitting, error: submitError, data: submitData }] = useMutation(SUBMIT_CHECK_IN);
  const [wantsToReorder, setWantsToReorder] = useState<boolean | null>(null);

  if (loading || qLoading) return <p className="text-sm text-slate-400 text-center py-12">Loading…</p>;

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
        <h1 className="text-lg font-semibold text-slate-900">Thanks — you&rsquo;re all set</h1>
        <p className="text-sm text-slate-500 mt-2">Your clinician will review your check-in before your next supply.</p>
        <p className="text-xs text-slate-400 mt-4">
          If you have severe symptoms in the meantime, call 112 or go to your nearest emergency department.
        </p>
      </div>
    );
  }

  const checkIn = data?.checkInByToken;
  const questions = qData?.questionnaire?.questions ?? [];

  const handleSubmit = (answers: SubmittedAnswer[]) => {
    submitCheckIn({ variables: { token, input: { answers, wantsToReorder } } });
  };

  return (
    <div>
      <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-4">
        <h1 className="text-xl font-bold text-slate-900">
          Hi {checkIn?.patientFirstName ?? 'there'}, let&rsquo;s check in
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          Your clinician reads this before sending your next supply. It takes about 2 minutes.
        </p>
      </div>

      <QuestionnaireForm
        questions={questions}
        submitting={submitting}
        error={submitError?.message}
        onSubmit={handleSubmit}
        ready={wantsToReorder !== null}
        footer={
          <fieldset className="bg-white rounded-2xl border border-slate-100 p-4">
            <p className="text-sm font-medium text-slate-900">Would you like to continue your treatment next month?</p>
            <div className="flex gap-2 mt-3">
              {[true, false].map((val) => (
                <button
                  key={String(val)}
                  type="button"
                  onClick={() => setWantsToReorder(val)}
                  className={`flex-1 px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                    wantsToReorder === val ? 'border-brand-500 bg-brand-50 text-brand-900 font-medium' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {val ? 'Yes, continue' : 'No, not right now'}
                </button>
              ))}
            </div>
          </fieldset>
        }
      />
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
