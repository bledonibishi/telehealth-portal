import { PrescriptionProofReviewService, StoredProofReview } from './prescription-proof-review.service';
import { DocumentReading } from './prior-dose-assessment';

const reading = (overrides: Partial<DocumentReading> = {}): DocumentReading => ({
  readable: true,
  isPrescriptionEvidence: true,
  patientName: 'Ann Lee',
  medicineName: 'Mounjaro',
  molecule: 'tirzepatide',
  doseMg: 2.5,
  documentDate: new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10),
  dateKind: 'dispensed',
  authenticityConcerns: [],
  notes: '',
  ...overrides,
});

function setup() {
  let stored: StoredProofReview | null = null;
  let proofFileId = 'proof-1';
  const prisma: any = {
    onboardingSubmission: {
      findUnique: jest.fn(async () => ({ patientId: 'p1', prescriptionProofFileId: proofFileId, prescriptionProofReview: stored })),
      update: jest.fn(async ({ data }: any) => {
        stored = data.prescriptionProofReview;
      }),
    },
    uploadedFile: { findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, patientId: 'p1', mimeType: 'image/jpeg', storageKey: 'k' })) },
    patient: { findUnique: jest.fn(async () => ({ firstName: 'Ann', lastName: 'Lee', lead: null })) },
    consultation: { findFirst: jest.fn(async () => null) },
    product: { findMany: jest.fn(async () => []) },
  };
  const uploads: any = { readContents: jest.fn(async () => Buffer.from('img')) };
  const reader: any = { read: jest.fn(), readNameEvidence: jest.fn() };
  const service = new PrescriptionProofReviewService(prisma, uploads, reader);
  return { service, reader, newUpload: (id: string) => (proofFileId = id) };
}

describe('PrescriptionProofReviewService attempts', () => {
  it('offers a re-upload after the first mismatch, then messaging the team after the second', async () => {
    const { service, reader, newUpload } = setup();
    reader.read.mockResolvedValue({ status: 'COMPLETED', reading: reading({ patientName: 'John Smith' }) });

    const first = await service.review('p1');
    expect(first).toMatchObject({ failedAttempts: 1, nextStep: 'REUPLOAD' });

    newUpload('proof-2');
    const second = await service.review('p1');
    expect(second).toMatchObject({ failedAttempts: 2, nextStep: 'CONTACT_US' });
    expect(second!.assessment.findings.map((f) => f.message)).toContain('Document still has issues after 2 attempts — patient offered to message the team');
  });

  it('clears the next step once a re-upload matches, without forgetting earlier attempts', async () => {
    const { service, reader, newUpload } = setup();
    reader.read.mockResolvedValueOnce({ status: 'COMPLETED', reading: reading({ documentDate: null }) });
    await service.review('p1');

    newUpload('proof-2');
    reader.read.mockResolvedValueOnce({ status: 'COMPLETED', reading: reading() });
    expect(await service.review('p1')).toMatchObject({ failedAttempts: 1, nextStep: 'NONE' });
  });

  it('a matching name-change document resolves a name mismatch', async () => {
    const { service, reader } = setup();
    reader.read.mockResolvedValue({ status: 'COMPLETED', reading: reading({ patientName: 'Ann Smith' }) });
    expect(await service.review('p1')).toMatchObject({ nextStep: 'REUPLOAD' });

    reader.readNameEvidence.mockResolvedValue({ status: 'COMPLETED', reading: { readable: true, documentType: 'Marriage certificate', names: ['Ann Smith', 'Ann Lee'] } });
    const after = await service.reviewNameEvidence('p1', 'evidence-1');
    expect(after).toMatchObject({ nextStep: 'NONE', failedAttempts: 1, nameEvidenceFileId: 'evidence-1' });
    expect(after!.assessment.nameMatch).toBe('MATCH_VIA_EVIDENCE');
  });

  it('does not count system failures (no API key) as patient attempts', async () => {
    const { service, reader } = setup();
    reader.read.mockResolvedValue({ status: 'NOT_CONFIGURED', reason: 'x' });
    expect(await service.review('p1')).toMatchObject({ failedAttempts: 0, nextStep: 'NONE' });
  });

  it('answering the dose question re-assesses without counting an attempt; a new upload clears the answer', async () => {
    const { service, reader, newUpload } = setup();
    reader.read.mockResolvedValue({ status: 'COMPLETED', reading: reading({ doseMg: 5 }) });
    // reported dose comes from the questionnaire; none here, so fake a mismatch via a stored answer
    const first = await service.review('p1');
    expect(first!.failedAttempts).toBe(0);

    const answered = await service.clarifyDose('p1', 'NOT_SURE');
    expect(answered).toMatchObject({ doseClarification: 'NOT_SURE', failedAttempts: 0 });

    newUpload('proof-2');
    expect(await service.review('p1')).toMatchObject({ doseClarification: null });
  });

  it('does not let an old upload’s review override “I have no proof”', async () => {
    const { service, reader } = setup();
    reader.read.mockResolvedValue({ status: 'COMPLETED', reading: reading() });
    await service.review('p1');
    const prisma = (service as any).prisma;
    const stored = (await prisma.onboardingSubmission.findUnique()).prescriptionProofReview;
    prisma.onboardingSubmission.findUnique.mockResolvedValueOnce({ patientId: 'p1', prescriptionProofFileId: 'proof-1', prescriptionProofReview: stored, prescriptionProofUnavailable: true });
    expect(await service.reassess('p1')).toBeNull();
  });

  it('says what the proof must show, from the account and the questionnaire', async () => {
    const { service } = setup();
    const prisma = (service as any).prisma;
    prisma.consultation.findFirst.mockResolvedValueOnce({
      quizAnswers: [
        { questionId: 'glp1_prior_use', value: 'yes' },
        { questionId: 'glp1_prior_medicine', value: 'mounjaro' },
        { questionId: 'glp1_prior_dose_tirzepatide', value: '2.5 mg' },
      ],
    });
    const req = await service.requirements('p1');
    expect(req).toMatchObject({ name: 'Ann Lee', medicine: 'Mounjaro', dose: '2.5 mg' });
    expect(req.notBefore).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
