import { PatientProfileService, intakeNumber, patientNumberOf } from './patient-profile.service';

const patient = (over: Record<string, unknown> = {}) => ({
  id: 'ckpatient00abc123', firstName: 'Arta', lastName: 'Krasniqi', email: 'arta@example.com', dateOfBirth: new Date('1998-03-14'),
  gender: null, heightCm: null, phone: null, addressLine1: null, addressLine2: null, city: null, postcode: null, country: null, activatedAt: null,
  onboarding: { status: 'APPROVED' },
  consultations: [{ quizAnswers: [{ questionId: 'height_cm', value: 168 }] }],
  ...over,
});

function build(p = patient()) {
  const prisma: any = { patient: { findUniqueOrThrow: jest.fn().mockResolvedValue(p), update: jest.fn() } };
  const audit = { log: jest.fn() };
  return { service: new PatientProfileService(prisma, audit as any), prisma, audit };
}

describe('PatientProfileService', () => {
  it('falls back to the intake height until the patient sets one, and shows them as verified once onboarding is approved', async () => {
    expect(await build().service.mine('p-1')).toMatchObject({ heightCm: 168, heightFromIntake: true, verified: true, patientNumber: '#HH-ABC123' });
    expect(await build(patient({ heightCm: 170 })).service.mine('p-1')).toMatchObject({ heightCm: 170, heightFromIntake: false });
  });

  it('saves only what changed, within bounds, and audits it', async () => {
    const { service, prisma, audit } = build();
    await service.update('p-1', { gender: 'FEMALE' as any, heightCm: 168.44 });
    expect(prisma.patient.update).toHaveBeenCalledWith({ where: { id: 'p-1' }, data: { gender: 'FEMALE', heightCm: 168.4 } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PROFILE_UPDATED', metadata: { fields: ['gender', 'heightCm'] } }));
    await expect(service.update('p-1', { heightCm: 80 })).rejects.toThrow(/between/);
    await expect(service.update('p-1', { phone: 'call me' })).rejects.toThrow(/phone/);
  });
});

describe('intakeNumber / patientNumberOf', () => {
  it('reads the newest numeric answer', () => {
    expect(intakeNumber([{ quizAnswers: [] }, { quizAnswers: [{ questionId: 'height_cm', value: '172' }] }], 'height_cm')).toBe(172);
    expect(intakeNumber([{ quizAnswers: null }], 'height_cm')).toBeNull();
    expect(patientNumberOf('abcdef')).toBe('#HH-ABCDEF');
  });
});
