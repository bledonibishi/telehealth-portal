'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@apollo/client';
import Link from 'next/link';
import PhotoUploadField from '@/components/onboarding/PhotoUploadField';
import { useOpenOnboardingChat } from '@/components/onboarding/OnboardingChat';
import { MY_CONSULTATIONS } from '@/graphql/consultations';
import { ProofSample } from '@/components/onboarding/ProofSample';
import { ProofRequirements } from '@/components/onboarding/ProofRequirements';
import { ProofSampleSlider } from '@/components/onboarding/ProofSampleSlider';
import {
  ChecklistLoader,
  DoseChoice,
  DoseQuestion,
  NAME_EVIDENCE_STEPS,
  PROOF_STEPS,
  ProofCheck,
  ProofChecklist,
} from '@/components/onboarding/ProofReview';
import {
  MY_ONBOARDING,
  SAVE_PRIOR_MEDICATION_USE,
  SAVE_PRESCRIPTION_PROOF_STEP,
  SAVE_PRESCRIPTION_NAME_EVIDENCE,
  CLARIFY_PRESCRIPTION_DOSE,
  DECLARE_PRESCRIPTION_PROOF_UNAVAILABLE,
} from '@/graphql/onboarding';

const PROOF_TYPES: { value: string; label: string; hint: string; fastest?: boolean }[] = [
  { value: 'MEDICINE_BOX_LABEL', label: 'Medicine box label', hint: 'Pharmacy sticker on your box, bottle, or pen', fastest: true },
  { value: 'PRESCRIPTION_DOCUMENT', label: 'Prescription document', hint: 'Prescription or notification issued by your GP' },
  { value: 'PHARMACY_RECORD', label: 'Pharmacy record', hint: 'Dispensing records, repeat medication lists, or medication history' },
  { value: 'ORDER_CONFIRMATION', label: 'Order confirmation', hint: 'Confirmation email or receipt from a previous order' },
];

type ProofReview = {
  status: string;
  riskLevel: 'OK' | 'UNVERIFIED' | 'CAUTION' | 'HIGH';
  patientMessage: string;
  requestedDoseLabel?: string | null;
  suggestedDoseLabel?: string | null;
  documentIssues: { code: string; patientHint: string }[];
  checks: ProofCheck[];
  doseMg?: number | null;
  reportedDoseLabel?: string | null;
  failedAttempts: number;
  nextStep: 'NONE' | 'REUPLOAD' | 'CONTACT_US';
};

const PROOF_HELP_DRAFT =
  'Hi, I’m having trouble with my proof of prescription — the details on my document didn’t match after a couple of tries. Could you help?';

const REVIEW_STYLE: Record<ProofReview['riskLevel'], { icon: string; title: string; box: string; iconCls: string }> = {
  OK: { icon: '✓', title: 'Document checked', box: 'bg-ink-50 border-ink-100 text-slate-700', iconCls: 'bg-ink-100 text-ink-800' },
  UNVERIFIED: { icon: 'i', title: 'A clinician will check your document', box: 'bg-slate-50 border-slate-200 text-slate-700', iconCls: 'bg-slate-200 text-slate-600' },
  CAUTION: { icon: '!', title: 'Please read before you continue', box: 'bg-amber-50 border-amber-200 text-amber-900', iconCls: 'bg-amber-100 text-amber-700' },
  HIGH: { icon: '!', title: 'Your dose may need to change', box: 'bg-red-50 border-red-200 text-red-800', iconCls: 'bg-red-100 text-red-700' },
};

export default function PrescriptionProofStepPage() {
  const router = useRouter();
  const openChat = useOpenOnboardingChat();
  const { data, loading: loadingOnboarding } = useQuery(MY_ONBOARDING, { fetchPolicy: 'network-only' });
  const o = data?.myOnboarding;
  // The medical questionnaire creates the consultation; it's where the patient says which medicine
  // and dose they used and when, which is what the proof is checked against.
  const { data: consultationsData, loading: loadingConsultations } = useQuery(MY_CONSULTATIONS, { fetchPolicy: 'network-only' });
  const questionnaireDone = ((consultationsData?.myConsultations ?? []) as { status: string }[]).some((c) => c.status !== 'DECLINED');

  const [priorUse, setPriorUse] = useState<boolean | null>(null);
  const [proofType, setProofType] = useState<string | null>(null);
  const [proofFileId, setProofFileId] = useState<string | null>(null);
  const [error, setError] = useState('');
  // The automatic check's outcome for the document just uploaded.
  const [review, setReview] = useState<ProofReview | null>(null);
  // Set once the patient leaves the outcome screen to upload again.
  const [dismissedReview, setDismissedReview] = useState(false);
  const [uploadingNameEvidence, setUploadingNameEvidence] = useState(false);
  const [nameEvidenceFileId, setNameEvidenceFileId] = useState<string | null>(null);
  // "I don't have any proof": the screen explaining what that means, before they confirm.
  const [askingNoProof, setAskingNoProof] = useState(false);
  // Chose "no proof" earlier and now wants to upload after all.
  const [foundProof, setFoundProof] = useState(false);
  // After a photo is uploaded the examples fold away, so the photo and Continue are on screen.
  const [showExamples, setShowExamples] = useState(false);
  // Uploading again after a check: the document type is already chosen, so go straight to the upload.
  const [reuploading, setReuploading] = useState(false);
  // On the upload step after a check's result (vs. straight from choosing a document type).
  const [fromResult, setFromResult] = useState(false);
  // Remounts the upload fields, so a re-upload starts from an empty field.
  const [uploadKey, setUploadKey] = useState(0);

  const [savePriorMedicationUse, { loading: savingPriorUse }] = useMutation(SAVE_PRIOR_MEDICATION_USE, {
    refetchQueries: [{ query: MY_ONBOARDING }],
  });
  const [savePrescriptionProofStep, { loading: savingProof }] = useMutation(SAVE_PRESCRIPTION_PROOF_STEP, {
    refetchQueries: [{ query: MY_ONBOARDING }],
  });
  const [saveNameEvidence, { loading: savingNameEvidence }] = useMutation(SAVE_PRESCRIPTION_NAME_EVIDENCE, {
    refetchQueries: [{ query: MY_ONBOARDING }],
  });
  const [clarifyDose, { loading: savingDoseAnswer }] = useMutation(CLARIFY_PRESCRIPTION_DOSE, {
    refetchQueries: [{ query: MY_ONBOARDING }],
  });
  const [declareNoProof, { loading: savingNoProof }] = useMutation(DECLARE_PRESCRIPTION_PROOF_UNAVAILABLE, {
    refetchQueries: [{ query: MY_ONBOARDING }],
  });

  const effectivePriorUse = priorUse ?? o?.priorMedicationUse ?? null;

  if (loadingOnboarding || loadingConsultations) return <p className="text-sm text-slate-400 text-center py-12">Loading…</p>;

  const handleNo = async () => {
    setError('');
    try {
      await savePriorMedicationUse({ variables: { priorMedicationUse: false } });
      router.push('/onboarding');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    }
  };

  const handleYes = async () => {
    setError('');
    setPriorUse(true);
    await savePriorMedicationUse({ variables: { priorMedicationUse: true } }).catch((err) =>
      setError(err.message ?? 'Something went wrong'),
    );
  };

  const handleContinue = async () => {
    if (!proofType || !proofFileId) return;
    setError('');
    try {
      const { data: saved } = await savePrescriptionProofStep({
        variables: { input: { prescriptionProofType: proofType, prescriptionProofFileId: proofFileId } },
      });
      const result: ProofReview | null = saved?.savePrescriptionProofStep?.prescriptionProofReview ?? null;
      if (result) showReview(result);
      else router.push('/onboarding');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    }
  };

  const handleNameEvidence = async () => {
    if (!nameEvidenceFileId) return;
    setError('');
    try {
      const { data: saved } = await saveNameEvidence({ variables: { fileId: nameEvidenceFileId } });
      const result: ProofReview | null = saved?.savePrescriptionNameEvidence?.prescriptionProofReview ?? null;
      if (result) showReview(result);
      else router.push('/onboarding');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    }
  };

  const handleDoseAnswer = async (choice: DoseChoice) => {
    setError('');
    try {
      const { data: saved } = await clarifyDose({ variables: { choice } });
      const result: ProofReview | null = saved?.clarifyPrescriptionDose?.prescriptionProofReview ?? null;
      if (result) showReview(result);
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    }
  };

  const showReview = (result: ProofReview) => {
    setReview(result);
    setDismissedReview(false);
    setReuploading(false);
    setUploadingNameEvidence(false);
    setNameEvidenceFileId(null);
  };

  const uploadAgain = () => {
    setReview(null);
    setDismissedReview(true);
    setUploadingNameEvidence(false);
    setProofFileId(null);
    setProofType(o?.prescriptionProofType ?? null);
    setReuploading(!!o?.prescriptionProofType);
    setFromResult(true);
    setUploadKey((k) => k + 1);
  };

  // Step 1 → step 2: the document type is chosen, so show its examples and the upload.
  const chooseType = (type: string) => {
    setProofType(type);
    setProofFileId(null);
    setShowExamples(false);
    setFromResult(false);
    setReuploading(true);
    setUploadKey((k) => k + 1);
  };

  const backToResult = () => {
    setReuploading(false);
    setDismissedReview(false);
  };

  // Coming back to this step with unresolved issues shows them again first.
  const savedReview: ProofReview | null = o?.prescriptionProofReview ?? null;
  const shownReview = review ?? (!dismissedReview && savedReview && savedReview.nextStep !== 'NONE' ? savedReview : null);

  // A change the clinician asked for on this step. Shown at the top of the step until the
  // patient acts on it (uploading proof, or confirming they have none, clears it).
  const clinicianRequest: string | undefined = (o?.stepFeedback ?? []).find((f: { step: string }) => f.step === 'PRESCRIPTION_PROOF')?.reason;
  // What didn't match on the last upload, for "Why your clinician asked for this".
  const lastFailures = ((savedReview?.checks ?? []) as ProofCheck[]).filter((c) => c.status === 'FAIL');
  const CHECK_NAME: Record<string, string> = { NAME: 'Name', MEDICINE: 'Medicine', DOSE: 'Dose', DATE: 'Date' };
  const clinicianCard = clinicianRequest ? (
    <details className="group mt-4 rounded-xl border border-rose-200 bg-rose-50/60">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-rose-900">
        Why your clinician asked for this
        <span className="text-rose-400 transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="border-t border-rose-100 px-4 py-3 space-y-3 text-sm">
        <div>
          <p className="text-xs font-semibold text-rose-700">Your clinician’s note</p>
          <p className="text-rose-900 mt-0.5">&ldquo;{clinicianRequest}&rdquo;</p>
        </div>
        {(lastFailures.length > 0 || o?.prescriptionProofUnavailable) && (
          <div>
            <p className="text-xs font-semibold text-rose-700">What didn’t match last time</p>
            <ul className="mt-1 space-y-1">
              {o?.prescriptionProofUnavailable && <li className="text-slate-700">You told us you don’t have proof.</li>}
              {lastFailures.map((c) => (
                <li key={c.key} className="text-slate-700">
                  <span className="font-medium text-slate-900">{CHECK_NAME[c.key]}:</span> {c.value ?? 'Not found'}
                  {c.hint && <span className="text-slate-500"> · {c.hint}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          onClick={() => openChat(`Hi, about your request on my proof of prescription (“${clinicianRequest}”): `)}
          className="text-sm font-medium text-rose-700 hover:text-rose-800"
        >
          Message your clinician →
        </button>
      </div>
    </details>
  ) : null;

  if (savingProof) return <ChecklistLoader title="Checking your document" steps={PROOF_STEPS} />;
  if (savingNameEvidence) return <ChecklistLoader title="Checking your name change" steps={NAME_EVIDENCE_STEPS} />;

  if (askingNoProof) {
    return (
      <div>
        <button onClick={() => setAskingNoProof(false)} className="text-sm text-slate-400 hover:text-slate-600">← Back</button>
        <h1 className="text-xl font-bold text-slate-900 mt-4">Don&rsquo;t have any proof?</h1>
        <p className="text-sm text-slate-500 mt-2">
          You can carry on without it. For your safety, you&rsquo;ll then start on the lowest dose, the same as someone new to
          this medicine. Your clinician reviews your dose at each check-in, and may still be able to confirm your
          previous dose another way.
        </p>

        <div className="mt-5 bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-sm font-medium text-slate-900">Before you decide, any of these works as proof:</p>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-600 list-disc pl-5">
            <li>An old box or pen with the pharmacy label still on it</li>
            <li>Your medication history from your GP practice or pharmacy (many have an app or can print it)</li>
            <li>The order confirmation email from the clinic or pharmacy you used before</li>
          </ul>
        </div>

        {error && <p className="text-xs text-danger-500 mt-3">{error}</p>}
        <button
          onClick={async () => {
            setError('');
            try {
              await declareNoProof();
              setAskingNoProof(false);
              router.push('/onboarding');
            } catch (err: any) {
              setError(err.message ?? 'Something went wrong');
            }
          }}
          disabled={savingNoProof}
          className="w-full mt-6 bg-ink-700 hover:bg-ink-800 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
        >
          {savingNoProof ? 'Saving…' : 'Continue without proof'}
        </button>
        <button
          onClick={() => setAskingNoProof(false)}
          className="w-full mt-3 px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          I&rsquo;ll find my proof
        </button>
        <button
          onClick={() => openChat('Hi, I’ve used this medication before but I don’t have proof of my prescription. What can I do?')}
          className="w-full mt-3 text-sm text-slate-500 hover:text-slate-700 py-2"
        >
          Not sure? Message our team
        </button>
      </div>
    );
  }

  if (o?.prescriptionProofUnavailable && !foundProof) {
    const uploadProof = () => {
      setFoundProof(true);
      setDismissedReview(true);
    };
    return (
      <div>
        <Link href="/onboarding" className="text-sm text-slate-400 hover:text-slate-600">← Back</Link>
        <h1 className="text-xl font-bold text-slate-900 mt-4">
          {clinicianRequest ? 'Your clinician needs more on your prescription' : 'Continuing without proof'}
        </h1>
        <p className="text-sm text-slate-500 mt-1.5">
          {clinicianRequest
            ? 'Please upload proof if you can, or let us know you still don’t have any.'
            : 'You’ll start like someone new to this medicine. Found proof? Upload it any time.'}
        </p>

        {o?.proofRequirements && <ProofRequirements data={o.proofRequirements} compact />}

        {error && <p className="text-xs text-danger-500 mt-3">{error}</p>}
        {clinicianRequest ? (
          <>
            <button
              onClick={uploadProof}
              className="w-full mt-5 bg-ink-700 hover:bg-ink-800 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
            >
              Upload proof
            </button>
            <button
              onClick={async () => {
                setError('');
                try {
                  await declareNoProof();
                  router.push('/onboarding');
                } catch (err: any) {
                  setError(err.message ?? 'Something went wrong');
                }
              }}
              disabled={savingNoProof}
              className="w-full mt-3 px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {savingNoProof ? 'Saving…' : 'I still don’t have any proof'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => router.push('/onboarding')}
              className="w-full mt-5 bg-ink-700 hover:bg-ink-800 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
            >
              Continue
            </button>
            <button
              onClick={uploadProof}
              className="w-full mt-3 px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              I found my proof — upload it
            </button>
          </>
        )}

        {/* The detail, folded away so the choice above stays on screen. */}
        {clinicianCard}
        <details className="group mt-3 rounded-xl border border-slate-100 bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-slate-700">
            What happens if I don’t have proof?
            <span className="text-slate-400 transition-transform group-open:rotate-90">›</span>
          </summary>
          <div className="border-t border-slate-100 px-4 py-3 space-y-2.5">
            {[
              ['💉', 'You’ll start on the lowest dose', 'The same as someone new to this medicine, while your body adjusts.'],
              ['📈', 'Any increase is your clinician’s decision', 'They review your dose at each check-in and only increase it if it suits you — never sooner than 4 weeks.'],
              ['📄', 'Found your proof later?', 'Upload it any time before your clinician decides, and they may continue you at your previous dose.'],
            ].map(([icon, title, body]) => (
              <div key={title} className="flex items-start gap-3">
                <span className="text-base leading-none mt-0.5" aria-hidden>{icon}</span>
                <div>
                  <p className="text-sm font-medium text-slate-900">{title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{body}</p>
                </div>
              </div>
            ))}
            <p className="text-xs text-slate-500 pt-1">
              Proof can be an old box or pen with the pharmacy label, your medication history from your GP practice or
              pharmacy, or the order email from your previous provider.
            </p>
          </div>
        </details>
      </div>
    );
  }

  if (shownReview && uploadingNameEvidence) {
    return (
      <div>
        <button onClick={() => setUploadingNameEvidence(false)} className="text-sm text-slate-400 hover:text-slate-600">← Back</button>
        <h1 className="text-xl font-bold text-slate-900 mt-4">Proof of your name change</h1>
        <p className="text-sm text-slate-500 mt-2">
          Upload a document that shows both your previous name and your current name, such as a marriage or civil partnership
          certificate, a deed poll, or a change-of-name declaration.
        </p>
        <div className="mt-5">
          <PhotoUploadField key={`name-${uploadKey}`} kind="PRESCRIPTION_PROOF" label="Upload document" onUploaded={setNameEvidenceFileId} />
        </div>
        {error && <p className="text-xs text-danger-500 mt-3">{error}</p>}
        <button
          onClick={handleNameEvidence}
          disabled={!nameEvidenceFileId}
          className="w-full mt-6 bg-ink-700 hover:bg-ink-800 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
        >
          Continue
        </button>
      </div>
    );
  }

  if (shownReview) {
    const r = shownReview;
    const style = REVIEW_STYLE[r.riskLevel] ?? REVIEW_STYLE.UNVERIFIED;
    const issues = r.documentIssues ?? [];
    const checks = r.checks ?? [];
    const nameMismatch = issues.some((i) => i.code === 'NAME_MISMATCH');
    // Problems with the document as a whole (unreadable, wrong kind of document) have no checklist line.
    const CHECKLIST_CODES = /^(NAME|MEDICINE|DOSE|DATE)_/;
    const otherIssues = checks.length ? issues.filter((i) => !CHECKLIST_CODES.test(i.code)) : issues;
    const askDose = issues.some((i) => i.code === 'DOSE_MISMATCH') && r.doseMg != null && !!r.reportedDoseLabel;
    const continueBtn = (primary: boolean, label: string) => (
      <button
        onClick={() => router.push('/onboarding')}
        className={
          primary
            ? 'w-full mt-6 bg-ink-700 hover:bg-ink-800 text-white font-semibold py-3 rounded-xl text-sm transition-colors'
            : 'w-full mt-3 text-sm text-slate-500 hover:text-slate-700 py-2'
        }
      >
        {label}
      </button>
    );

    return (
      <div>
        <h1 className="text-xl font-bold text-slate-900 mt-4">
          {r.nextStep === 'CONTACT_US' ? 'Let’s sort this out together' : issues.length ? 'Some details need another look' : 'Thanks for your proof'}
        </h1>
        {clinicianCard}

        {/* The one thing to answer comes first, above the checklist. */}
        {askDose && (
          <DoseQuestion documentMg={r.doseMg!} reportedDose={r.reportedDoseLabel!} saving={savingDoseAnswer} onAnswer={handleDoseAnswer} />
        )}

        {checks.length > 0 && <ProofChecklist checks={checks} />}

        {otherIssues.length > 0 && (
          <div className="mt-5 bg-white rounded-xl border border-amber-200 divide-y divide-slate-100">
            {otherIssues.map((i) => (
              <p key={i.code} className="px-4 py-3 text-sm text-amber-900 leading-relaxed">{i.patientHint}</p>
            ))}
          </div>
        )}
        {error && <p className="text-xs text-danger-500 mt-3">{error}</p>}

        {/* Empty when the document's issues are the whole story. */}
        {r.patientMessage && (
          <div className={`mt-5 rounded-xl border px-4 py-4 text-sm ${style.box}`}>
            <div className="flex items-start gap-3">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${style.iconCls}`}>
                {style.icon}
              </span>
              <div>
                <p className="font-semibold">{style.title}</p>
                <p className="mt-1 leading-relaxed">{r.patientMessage}</p>
              </div>
            </div>
          </div>
        )}

        {r.nextStep === 'REUPLOAD' && (
          <>
            {nameMismatch && (
              <button
                onClick={() => {
                  setUploadingNameEvidence(true);
                  setUploadKey((k) => k + 1);
                }}
                className="w-full mt-6 bg-ink-700 hover:bg-ink-800 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
              >
                Upload proof of name change
              </button>
            )}
            <button
              onClick={uploadAgain}
              className={
                nameMismatch
                  ? 'w-full mt-3 px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50'
                  : 'w-full mt-6 bg-ink-700 hover:bg-ink-800 text-white font-semibold py-3 rounded-xl text-sm transition-colors'
              }
            >
              {nameMismatch ? 'Upload a document in my current name' : 'Upload a different document'}
            </button>
            <button onClick={() => setAskingNoProof(true)} className="w-full mt-3 text-sm text-slate-500 hover:text-slate-700 py-2">
              Continue without proof
            </button>
          </>
        )}

        {r.nextStep === 'CONTACT_US' && (
          <>
            <p className="text-sm text-slate-600 mt-5 leading-relaxed">
              Still not matching? Our team can help — or continue without proof and start on the lowest dose.
            </p>
            <button
              onClick={() => openChat(PROOF_HELP_DRAFT)}
              className="w-full mt-6 bg-ink-700 hover:bg-ink-800 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
            >
              Message our team
            </button>
            <button
              onClick={uploadAgain}
              className="w-full mt-3 px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Try another document
            </button>
            <button onClick={() => setAskingNoProof(true)} className="w-full mt-3 text-sm text-slate-500 hover:text-slate-700 py-2">
              Continue without proof
            </button>
          </>
        )}

        {r.nextStep === 'NONE' && (
          <>
            {continueBtn(true, 'Continue')}
            {r.riskLevel !== 'OK' && (
              <button
                onClick={uploadAgain}
                className="w-full mt-3 px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Upload a different document
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  if (!questionnaireDone) {
    return (
      <div>
        <Link href="/onboarding" className="text-sm text-slate-400 hover:text-slate-600">← Back</Link>
        <h1 className="text-xl font-bold text-slate-900 mt-4">First, your medical questionnaire</h1>
        <p className="text-sm text-slate-500 mt-2">
          In the questionnaire you tell us which medicine you used before, your dose and when you last took it. We check your
          proof against those answers, so please complete it first.
        </p>
        <button
          onClick={() => router.push('/onboarding/medical-questionnaire')}
          className="w-full mt-6 bg-ink-700 hover:bg-ink-800 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
        >
          Go to the medical questionnaire
        </button>
      </div>
    );
  }

  if (effectivePriorUse === false) {
    return (
      <div>
        <Link href="/onboarding" className="text-sm text-slate-400 hover:text-slate-600">← Back</Link>
        <h1 className="text-xl font-bold text-slate-900 mt-4">No proof needed</h1>
        <p className="text-sm text-slate-500 mt-2">
          You told us this is your first time using this medication, so there&rsquo;s nothing to upload. Your clinician will
          start you on the lowest dose.
        </p>
        {error && <p className="text-xs text-danger-500 mt-3">{error}</p>}
        <button
          onClick={() => router.push('/onboarding')}
          className="w-full mt-6 bg-ink-700 hover:bg-ink-800 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
        >
          Continue
        </button>
        <button
          onClick={handleYes}
          disabled={savingPriorUse}
          className="w-full mt-3 px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Actually, I have used it before
        </button>
      </div>
    );
  }

  if (effectivePriorUse === null) {
    return (
      <div>
        <Link href="/onboarding" className="text-sm text-slate-400 hover:text-slate-600">← Back</Link>
        <h1 className="text-xl font-bold text-slate-900 mt-4">Have you used this medication before?</h1>
        <p className="text-sm text-slate-500 mt-2">
          If you have an existing prescription, we can verify your dose without repeating the full clinical review.
        </p>

        {error && <p className="text-xs text-danger-500 mt-3">{error}</p>}

        <div className="space-y-3 mt-6">
          <button
            onClick={handleYes}
            disabled={savingPriorUse}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 hover:bg-slate-50 text-left"
          >
            Yes, I have a current prescription
          </button>
          <button
            onClick={handleNo}
            disabled={savingPriorUse}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 hover:bg-slate-50 text-left"
          >
            No, this is my first time
          </button>
        </div>
      </div>
    );
  }

  const chosenType = PROOF_TYPES.find((t) => t.value === proofType);
  // What didn't match on the previous upload, highlighted in the example.
  const flaggedLastTime = fromResult ? ((savedReview?.checks ?? []) as ProofCheck[]).filter((c) => c.status !== 'PASS').map((c) => c.key) : [];
  if (reuploading && chosenType) {
    return (
      <div>
        <button onClick={fromResult ? backToResult : () => setReuploading(false)} className="text-sm text-slate-400 hover:text-slate-600">
          ← Back
        </button>

        <h1 className="text-xl font-bold text-slate-900 mt-3">{fromResult ? 'Upload a new document' : `Upload your ${chosenType.label.toLowerCase()}`}</h1>
        <p className="text-sm text-slate-500 mt-1">Make sure your name, medicine, dose and date are readable.</p>
        {clinicianCard}

        <p className="mt-3 text-sm text-slate-600">
          Document: <span className="font-medium text-slate-900">{chosenType.label}</span>
          <span className="text-slate-300"> · </span>
          <button onClick={() => setReuploading(false)} className="font-medium text-ink-800 hover:text-ink-900">
            Change
          </button>
        </p>

        {o?.proofRequirements && <ProofRequirements data={o.proofRequirements} compact />}

        {!proofFileId || showExamples ? (
          chosenType.value === 'MEDICINE_BOX_LABEL' ? (
            <ProofSampleSlider flagged={flaggedLastTime} />
          ) : (
            <ProofSample type={chosenType.value} flagged={flaggedLastTime} />
          )
        ) : (
          <button onClick={() => setShowExamples(true)} className="mt-3 text-sm font-medium text-ink-800 hover:text-ink-900">
            Show examples
          </button>
        )}

        <div className="mt-3">
          <PhotoUploadField
            key={`proof-${uploadKey}`}
            kind="PRESCRIPTION_PROOF"
            label={proofFileId ? 'Your photo' : 'Upload proof'}
            onUploaded={(id) => {
              setProofFileId(id);
              setShowExamples(false);
            }}
          />
        </div>

        {error && <p className="text-xs text-danger-500 mt-3">{error}</p>}

        <button
          onClick={handleContinue}
          disabled={!proofFileId}
          className="w-full mt-3 bg-ink-700 hover:bg-ink-800 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
        >
          Continue
        </button>
        <button onClick={() => setAskingNoProof(true)} className="w-full mt-3 text-sm text-slate-500 hover:text-slate-700 py-2">
          I don&rsquo;t have any proof
        </button>
      </div>
    );
  }

  return (
    <div>
      <Link href="/onboarding" className="text-sm text-slate-400 hover:text-slate-600">← Back</Link>

      <h1 className="text-xl font-bold text-slate-900 mt-4">What proof do you have?</h1>
      <p className="text-sm text-slate-500 mt-2">
        We need to verify your current prescription so you can continue at the right dose. Choose the one you have to hand.
      </p>
      {clinicianCard}

      <div className="space-y-2 mt-5">
        {PROOF_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => chooseType(t.value)}
            className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
              proofType === t.value ? 'border-ink-500 bg-ink-50' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div
              className={`w-4 h-4 mt-0.5 rounded-full border flex-shrink-0 ${
                proofType === t.value ? 'border-ink-700 bg-ink-700' : 'border-slate-300'
              }`}
            />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-slate-900">{t.label}</p>
                {t.fastest && (
                  <span className="text-[10px] font-semibold text-ink-800 bg-ink-100 px-1.5 py-0.5 rounded">
                    FASTEST TO VERIFY
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{t.hint}</p>
            </div>
          </button>
        ))}
      </div>

      <button onClick={() => setAskingNoProof(true)} className="mt-3 text-sm font-medium text-ink-800 hover:text-ink-900">
        I don&rsquo;t have any proof
      </button>

      {error && <p className="text-xs text-danger-500 mt-3">{error}</p>}
    </div>
  );
}
