'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@apollo/client';
import Link from 'next/link';
import PhotoUploadField from '@/components/onboarding/PhotoUploadField';
import {
  MY_ONBOARDING,
  SAVE_PRIOR_MEDICATION_USE,
  SAVE_PRESCRIPTION_PROOF_STEP,
} from '@/graphql/onboarding';

const PROOF_TYPES: { value: string; label: string; hint: string; fastest?: boolean }[] = [
  { value: 'MEDICINE_BOX_LABEL', label: 'Medicine box label', hint: 'Pharmacy sticker on your box, bottle, or pen', fastest: true },
  { value: 'PRESCRIPTION_DOCUMENT', label: 'Prescription document', hint: 'Prescription or notification issued by your GP' },
  { value: 'PHARMACY_RECORD', label: 'Pharmacy record', hint: 'Dispensing records, repeat medication lists, or medication history' },
  { value: 'ORDER_CONFIRMATION', label: 'Order confirmation', hint: 'Confirmation email or receipt from a previous order' },
];

export default function PrescriptionProofStepPage() {
  const router = useRouter();
  const { data, loading: loadingOnboarding } = useQuery(MY_ONBOARDING, { fetchPolicy: 'network-only' });
  const o = data?.myOnboarding;

  const [priorUse, setPriorUse] = useState<boolean | null>(null);
  const [proofType, setProofType] = useState<string | null>(null);
  const [proofFileId, setProofFileId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [savePriorMedicationUse, { loading: savingPriorUse }] = useMutation(SAVE_PRIOR_MEDICATION_USE, {
    refetchQueries: [{ query: MY_ONBOARDING }],
  });
  const [savePrescriptionProofStep, { loading: savingProof }] = useMutation(SAVE_PRESCRIPTION_PROOF_STEP, {
    refetchQueries: [{ query: MY_ONBOARDING }],
  });

  const effectivePriorUse = priorUse ?? o?.priorMedicationUse ?? null;

  if (loadingOnboarding) return <p className="text-sm text-slate-400 text-center py-12">Loading…</p>;

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
      await savePrescriptionProofStep({
        variables: { input: { prescriptionProofType: proofType, prescriptionProofFileId: proofFileId } },
      });
      router.push('/onboarding');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    }
  };

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

  return (
    <div>
      <Link href="/onboarding" className="text-sm text-slate-400 hover:text-slate-600">← Back</Link>

      <h1 className="text-xl font-bold text-slate-900 mt-4">What proof do you have?</h1>
      <p className="text-sm text-slate-500 mt-2">
        We need to verify your current prescription so you can continue at the right dose. Choose the one you have to hand.
      </p>

      <div className="space-y-2 mt-5">
        {PROOF_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setProofType(t.value)}
            className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
              proofType === t.value ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div
              className={`w-4 h-4 mt-0.5 rounded-full border flex-shrink-0 ${
                proofType === t.value ? 'border-brand-600 bg-brand-600' : 'border-slate-300'
              }`}
            />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-slate-900">{t.label}</p>
                {t.fastest && (
                  <span className="text-[10px] font-semibold text-brand-700 bg-brand-100 px-1.5 py-0.5 rounded">
                    FASTEST TO VERIFY
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{t.hint}</p>
            </div>
          </button>
        ))}
      </div>

      {proofType && (
        <div className="mt-5">
          <PhotoUploadField kind="PRESCRIPTION_PROOF" label="Upload proof" onUploaded={setProofFileId} />
        </div>
      )}

      {error && <p className="text-xs text-danger-500 mt-3">{error}</p>}

      <button
        onClick={handleContinue}
        disabled={!proofType || !proofFileId || savingProof}
        className="w-full mt-6 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
      >
        {savingProof ? 'Saving…' : 'Continue'}
      </button>
    </div>
  );
}
