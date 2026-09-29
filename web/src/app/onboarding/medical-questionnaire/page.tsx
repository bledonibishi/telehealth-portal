'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery } from '@apollo/client';
import { CONSENT_TEXT, MY_PRODUCT_KIND, QUESTIONNAIRE, SUBMIT_INTAKE } from '@/graphql/intake';
import { MY_CONSULTATIONS } from '@/graphql/consultations';
import { QuestionnaireForm, SubmittedAnswer } from '@/components/intake/QuestionnaireForm';

const PROGRAMMES = [
  { kind: 'HRT', label: 'HRT — menopause symptoms' },
  { kind: 'GLP1', label: 'GLP-1 — weight management' },
] as const;

export default function MedicalQuestionnairePage() {
  return (
    <Suspense>
      <MedicalQuestionnaire />
    </Suspense>
  );
}

function MedicalQuestionnaire() {
  const router = useRouter();
  // Opened from the dashboard to answer a clinician's request for more information.
  const returnTo = useSearchParams().get('from') === 'dashboard' ? '/dashboard' : '/onboarding';

  const { data: kindData, loading: kindLoading } = useQuery(MY_PRODUCT_KIND);
  const [chosenKind, setChosenKind] = useState<string | null>(null);
  const kind = chosenKind ?? kindData?.myProductKind ?? null;

  const { data, loading } = useQuery(QUESTIONNAIRE, { variables: { kind, stage: 'INTAKE' }, skip: !kind });
  const { data: consentData } = useQuery(CONSENT_TEXT, { variables: { type: 'TELEHEALTH' } });
  const consent = consentData?.consentText;
  const [consented, setConsented] = useState(false);
  const [error, setError] = useState('');
  const [submit, { loading: submitting }] = useMutation(SUBMIT_INTAKE, {
    refetchQueries: [{ query: MY_CONSULTATIONS }],
    onCompleted: () => router.push(returnTo),
    onError: (e) => setError(e.message),
  });

  const handleSubmit = (answers: SubmittedAnswer[]) => {
    setError('');
    submit({ variables: { input: { kind, answers, telehealthConsentVersion: consent?.version } } });
  };

  return (
    <div>
      <Link href={returnTo} className="text-sm text-slate-400 hover:text-slate-600">← Back</Link>

      <h1 className="text-xl font-bold text-slate-900 mt-4">Medical questionnaire</h1>
      <p className="text-sm text-slate-500 mt-2">
        A doctor reads every answer before prescribing, so please be as accurate as you can. It takes about 5 minutes.
      </p>

      {kindLoading && <p className="text-sm text-slate-400 mt-6">Loading…</p>}

      {!kindLoading && !kind && (
        <div className="mt-6 space-y-2">
          <p className="text-sm font-medium text-slate-900">Which treatment is this for?</p>
          {PROGRAMMES.map((p) => (
            <button
              key={p.kind}
              onClick={() => setChosenKind(p.kind)}
              className="w-full text-left bg-white rounded-2xl border border-slate-100 px-4 py-3 text-sm hover:bg-slate-50"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {kind && loading && <p className="text-sm text-slate-400 mt-6">Loading questions…</p>}

      {data?.questionnaire && (
        <div className="mt-6">
          <QuestionnaireForm
            questions={data.questionnaire.questions}
            submitting={submitting}
            error={error}
            onSubmit={handleSubmit}
            ready={consented && !!consent}
            footer={
              consent && (
                <fieldset className="bg-white rounded-2xl border border-slate-100 p-4">
                  <p className="text-sm font-medium text-slate-900">Before you send this</p>
                  <ul className="mt-2 space-y-1.5 list-disc pl-5 text-xs text-slate-600">
                    {consent.text.split('\n').map((line: string) => <li key={line}>{line}</li>)}
                  </ul>
                  <label className="flex items-start gap-2.5 mt-3 text-sm text-slate-800 cursor-pointer">
                    <input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} className="mt-0.5 accent-brand-600" />
                    I understand and agree
                  </label>
                </fieldset>
              )
            }
          />
        </div>
      )}
    </div>
  );
}
