'use client';

import AuthedImage from '@/components/AuthedImage';
import { useI18n } from '@/lib/i18n/I18nProvider';

export type ProofReview = {
  status: string;
  reason?: string | null;
  riskLevel: 'OK' | 'UNVERIFIED' | 'CAUTION' | 'HIGH';
  findings: { severity: 'INFO' | 'WARNING' | 'CRITICAL'; message: string }[];
  documentIssues: { code: string; patientHint: string }[];
  failedAttempts: number;
  nextStep: 'NONE' | 'REUPLOAD' | 'CONTACT_US';
  nameEvidenceUrl?: string | null;
  nameEvidenceDocumentType?: string | null;
  nameEvidenceNames: string[];
  reportedMedicine?: string | null;
  reportedDoseLabel?: string | null;
  reportedLastDose?: string | null;
  reportedWeeksOnDose?: string | null;
  doseClarification?: 'DOCUMENT_CORRECT' | 'STEPPED_UP_SINCE' | 'STEPPED_DOWN_SINCE' | 'NOT_SURE' | null;
  requestedDoseLabel?: string | null;
  suggestedDoseLabel?: string | null;
  nameMatch?: string | null;
  patientNameOnDocument?: string | null;
  medicineName?: string | null;
  doseMg?: number | null;
  documentDate?: string | null;
  dateKind?: string | null;
  notes?: string | null;
  model?: string | null;
  reviewedAt: string;
};

export const RISK: Record<ProofReview['riskLevel'], { label: string; cls: string }> = {
  OK: { label: 'Dose looks safe', cls: 'bg-green-50 text-green-700' },
  UNVERIFIED: { label: 'Not verified', cls: 'bg-gray-100 text-gray-600' },
  CAUTION: { label: 'Check carefully', cls: 'bg-amber-50 text-amber-700' },
  HIGH: { label: 'High risk', cls: 'bg-red-50 text-red-700' },
};

const SEVERITY_CLS = { INFO: 'text-gray-500', WARNING: 'text-amber-700', CRITICAL: 'text-red-700' };
const NEXT_STEP: Record<string, string> = {
  REUPLOAD: 'Patient asked to upload again',
  CONTACT_US: 'Patient asked to message the team',
};
const NAME_MATCH: Record<string, string> = { MATCH_VIA_EVIDENCE: '✓ via name-change document', MATCH: '✓ matches', PARTIAL: '≈ partial match', MISMATCH: '✗ does not match', NOT_FOUND: 'not visible' };

// What the automatic check read off the proof and what the dose rules made of
// it. Advisory: the reviewer compares it with the image before deciding.
export function ProofReviewCard({ review }: { review: ProofReview }) {
  const { t } = useI18n();
  const risk = RISK[review.riskLevel] ?? RISK.UNVERIFIED;
  const read = review.status === 'COMPLETED';

  return (
    <div className="rounded-xl border border-gray-100 p-3 space-y-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-gray-700">{t('Automatic proof check')}</p>
        <span className={`font-medium px-2 py-0.5 rounded ${risk.cls}`}>{t(risk.label)}</span>
      </div>

      {review.failedAttempts > 0 && (
        <p className="text-gray-700">
          {t('{n} upload(s) with issues', { n: String(review.failedAttempts) })}
          {NEXT_STEP[review.nextStep] && <> · <span className="font-medium">{t(NEXT_STEP[review.nextStep])}</span></>}
        </p>
      )}

      {!read && <p className="text-gray-500">{t('Not read automatically: {reason}', { reason: review.reason ?? review.status })}</p>}

      {read && <Comparison review={review} />}

      {(review.requestedDoseLabel || review.suggestedDoseLabel) && (
        <p className="text-gray-700">
          {t('Ordered {requested}', { requested: review.requestedDoseLabel ?? '—' })}
          {review.suggestedDoseLabel && review.suggestedDoseLabel !== review.requestedDoseLabel && (
            <> · <span className="font-semibold">{t('safe next dose {dose}', { dose: review.suggestedDoseLabel })}</span></>
          )}
        </p>
      )}

      {review.findings.length > 0 && (
        <ul className="space-y-0.5">
          {review.findings.map((f, i) => (
            <li key={i} className={SEVERITY_CLS[f.severity] ?? 'text-gray-500'}>• {f.message}</li>
          ))}
        </ul>
      )}
      {review.nameEvidenceUrl && (
        <div className="pt-1">
          <p className="text-gray-500 mb-1">
            {t('Name-change document')}
            {review.nameEvidenceDocumentType && ` (${review.nameEvidenceDocumentType})`}
            {review.nameEvidenceNames.length > 0 && `: ${review.nameEvidenceNames.join(', ')}`}
          </p>
          <AuthedImage path={review.nameEvidenceUrl} alt={t('Name-change document')} className="w-full max-h-40 object-cover rounded-lg border border-gray-100" />
        </div>
      )}
      {read && review.notes && <p className="text-gray-500 italic">{review.notes}</p>}
      <p className="text-gray-400">{t('Read by AI ({model}). Always compare with the image above.', { model: review.model ?? '—' })}</p>
    </div>
  );
}

const DOSE_ANSWER: Record<string, string> = {
  DOCUMENT_CORRECT: 'The document is right',
  STEPPED_UP_SINCE: 'Moved up to their answer since the document',
  STEPPED_DOWN_SINCE: 'Went down to their answer since the document',
  NOT_SURE: 'Not sure',
};

const mg = (text?: string | null) => (text ? parseFloat(text) : NaN);

/**
 * What the AI read off the document next to what the patient answered in the questionnaire,
 * with disagreements highlighted.
 */
function Comparison({ review }: { review: ProofReview }) {
  const { t } = useI18n();
  const docDose = review.doseMg != null ? `${review.doseMg} mg` : null;
  const medicineDiffers =
    !!review.medicineName && !!review.reportedMedicine && !review.medicineName.toLowerCase().includes(review.reportedMedicine.toLowerCase());
  const doseDiffers = review.doseMg != null && !!review.reportedDoseLabel && review.doseMg !== mg(review.reportedDoseLabel);
  const nameDiffers = review.nameMatch === 'MISMATCH' || review.nameMatch === 'NOT_FOUND';

  const rows: Array<{ label: string; doc: React.ReactNode; said: React.ReactNode; differs?: boolean }> = [
    {
      label: t('Name'),
      doc: review.patientNameOnDocument ?? '—',
      said: review.nameMatch ? t(NAME_MATCH[review.nameMatch] ?? review.nameMatch) : '—',
      differs: nameDiffers,
    },
    { label: t('Medicine'), doc: review.medicineName ?? '—', said: review.reportedMedicine ?? '—', differs: medicineDiffers },
    {
      label: t('Dose'),
      doc: docDose ?? '—',
      said: (
        <>
          {review.reportedDoseLabel ?? '—'}
          {review.doseClarification && (
            <span className="block text-gray-500">
              {t('Asked which is right: “{answer}”', { answer: t(DOSE_ANSWER[review.doseClarification] ?? review.doseClarification) })}
            </span>
          )}
        </>
      ),
      differs: doseDiffers,
    },
    {
      label: t('Date'),
      doc: review.documentDate ? `${review.documentDate} (${review.dateKind})` : '—',
      said: review.reportedLastDose ? t('Last injection: {when}', { when: t(review.reportedLastDose) }) : '—',
    },
    { label: t('Time on dose'), doc: '—', said: review.reportedWeeksOnDose ? t(review.reportedWeeksOnDose) : '—' },
  ];

  return (
    <table className="w-full text-left">
      <thead>
        <tr className="text-gray-400">
          <th className="font-normal pb-1 w-[22%]"></th>
          <th className="font-normal pb-1">{t('On the document')}</th>
          <th className="font-normal pb-1">{t('Patient said')}</th>
        </tr>
      </thead>
      <tbody className="align-top">
        {rows.map((r) => (
          <tr key={r.label} className={r.differs ? 'bg-amber-50' : ''}>
            <td className="py-0.5 pr-2 text-gray-500">{r.label}</td>
            <td className={`py-0.5 pr-2 ${r.differs ? 'text-amber-800 font-medium' : 'text-gray-900'}`}>{r.doc}</td>
            <td className={`py-0.5 ${r.differs ? 'text-amber-800 font-medium' : 'text-gray-900'}`}>{r.said}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

