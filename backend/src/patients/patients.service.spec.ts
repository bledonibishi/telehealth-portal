import * as bcrypt from 'bcryptjs';
import { PatientsService } from './patients.service';

// findAll/updateMyBasicInfo only touch prisma — the other four constructor
// deps (audit, posthog, consents, prescribing) are only exercised by
// createByStaff, below.
const noopDeps = () => [{ log: jest.fn() } as any, { capture: jest.fn() } as any, {} as any, {} as any] as const;

describe('PatientsService.findAll', () => {
  const row = (over: Partial<any> = {}) => ({
    id: 'p-1',
    firstName: 'Emma',
    lead: { productKind: 'HRT' },
    consultations: [{ status: 'APPROVED' }],
    prescriptions: [{ id: 'rx-1' }],
    checkIns: [{ status: 'SENT', dueAt: new Date('2026-10-01') }],
    ...over,
  });

  it('flattens the lead, latest consultation, active prescription and latest check-in onto the patient', async () => {
    const prisma = { patient: { findMany: jest.fn().mockResolvedValue([row()]) } };
    const deps = noopDeps();
    const [result] = await new PatientsService(prisma as any, ...deps).findAll();

    expect(result).toMatchObject({
      id: 'p-1',
      firstName: 'Emma',
      productKind: 'HRT',
      latestConsultationStatus: 'APPROVED',
      hasActivePrescription: true,
      lastCheckInStatus: 'SENT',
      lastCheckInDueAt: new Date('2026-10-01'),
    });
    expect(result).not.toHaveProperty('lead');
    expect(result).not.toHaveProperty('consultations');
    expect(result).not.toHaveProperty('prescriptions');
    expect(result).not.toHaveProperty('checkIns');
  });

  it('only counts active prescriptions', async () => {
    const prisma = { patient: { findMany: jest.fn().mockResolvedValue([row({ prescriptions: [] })]) } };
    const deps = noopDeps();
    const [result] = await new PatientsService(prisma as any, ...deps).findAll();
    expect(result.hasActivePrescription).toBe(false);
  });

  it('defaults everything to null for a patient with no lead, consultations or check-ins', async () => {
    const prisma = {
      patient: {
        findMany: jest.fn().mockResolvedValue([row({ lead: null, consultations: [], checkIns: [], prescriptions: [] })]),
      },
    };
    const deps = noopDeps();
    const [result] = await new PatientsService(prisma as any, ...deps).findAll();

    expect(result).toMatchObject({
      productKind: null,
      latestConsultationStatus: null,
      hasActivePrescription: false,
      lastCheckInStatus: null,
      lastCheckInDueAt: null,
    });
  });

  it('queries the latest consultation and check-in only (take 1, newest first) and only active prescriptions', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const deps = noopDeps();
    await new PatientsService({ patient: { findMany } } as any, ...deps).findAll();

    const { include } = findMany.mock.calls[0][0];
    expect(include.consultations).toMatchObject({ take: 1, orderBy: { submittedAt: 'desc' } });
    expect(include.checkIns).toMatchObject({ take: 1, orderBy: { createdAt: 'desc' } });
    expect(include.prescriptions).toMatchObject({ where: { status: 'ACTIVE' } });
  });
});

describe('PatientsService.updateMyBasicInfo', () => {
  const validInput = {
    firstName: ' Emma ',
    lastName: ' White ',
    dateOfBirth: new Date('1990-05-01'),
    phone: ' +383 44 000 000 ',
    addressLine1: ' Rr. A 1 ',
    addressLine2: '',
    city: ' Prishtinë ',
    postcode: ' 10000 ',
    country: ' Kosovo ',
  };

  const service = (update = jest.fn()) => {
    const deps = noopDeps();
    return [new PatientsService({ patient: { update } } as any, ...deps), update] as const;
  };

  it('trims and saves name, date of birth and address, dropping a blank address line 2', async () => {
    const [svc, update] = service();
    await svc.updateMyBasicInfo('p-1', validInput as any);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: {
        firstName: 'Emma',
        lastName: 'White',
        dateOfBirth: validInput.dateOfBirth,
        phone: '+383 44 000 000',
        addressLine1: 'Rr. A 1',
        addressLine2: null,
        city: 'Prishtinë',
        postcode: '10000',
        country: 'Kosovo',
      },
    });
  });

  it('rejects a blank name', async () => {
    const [svc, update] = service();
    await expect(svc.updateMyBasicInfo('p-1', { ...validInput, firstName: '  ' } as any)).rejects.toThrow(/first and last name/);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a date of birth in the future', async () => {
    const [svc] = service();
    const future = new Date(Date.now() + 86_400_000);
    await expect(svc.updateMyBasicInfo('p-1', { ...validInput, dateOfBirth: future } as any)).rejects.toThrow(/valid date of birth/);
  });

  it('rejects an unparseable date of birth', async () => {
    const [svc] = service();
    await expect(svc.updateMyBasicInfo('p-1', { ...validInput, dateOfBirth: 'not-a-date' } as any)).rejects.toThrow(/valid date of birth/);
  });

  it('rejects someone under 18', async () => {
    const [svc] = service();
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    await expect(svc.updateMyBasicInfo('p-1', { ...validInput, dateOfBirth: tenYearsAgo } as any)).rejects.toThrow(/at least 18/);
  });

  it('rejects a missing delivery address field', async () => {
    const [svc, update] = service();
    await expect(svc.updateMyBasicInfo('p-1', { ...validInput, city: '' } as any)).rejects.toThrow(/phone number and full delivery address/);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('PatientsService.createByStaff', () => {
  const CATALOG: Record<string, any> = {
    'semaglutide-wegovy': {
      id: 'prod-glp1',
      defaultDirections: 'Inject weekly',
      strengths: [{ id: 'str-glp1-0.25', label: '0.25 mg', defaultQuantity: 1 }],
    },
    'estradiol-gel-oestrogel': {
      id: 'prod-estrogen',
      defaultDirections: 'Apply daily',
      strengths: [{ id: 'str-estrogen', label: '0.75 mg per pump', defaultQuantity: 1 }],
    },
    'progesterone-utrogestan': {
      id: 'prod-progestogen',
      defaultDirections: 'Take nightly',
      strengths: [{ id: 'str-progestogen', label: '100 mg', defaultQuantity: 1 }],
    },
  };

  // Enough answers to satisfy every non-optional, visible question on each
  // plan's INTAKE questionnaire (backend/src/questionnaires/definitions.ts).
  const GLP1_ANSWERS = [
    { questionId: 'height_cm', answer: '170', value: '170' },
    { questionId: 'weight_kg', answer: '95', value: '95' },
    { questionId: 'bp_known', answer: 'No', value: 'no' },
    { questionId: 'smoking', answer: 'Never', value: 'never' },
    { questionId: 'current_medications', answer: 'None' },
    { questionId: 'allergies', answer: 'None' },
    { questionId: 'glp1_prior_use', answer: 'No', value: 'no' },
    { questionId: 'diabetes_medicines', answer: 'None of these', value: 'none' },
    { questionId: 'eating_disorder', answer: 'No', value: 'no' },
    { questionId: 'gallbladder', answer: 'No', value: 'no' },
    { questionId: 'kidney_disease', answer: 'No', value: 'no' },
    { questionId: 'bariatric_surgery', answer: 'No', value: 'no' },
  ];
  const HRT_ANSWERS = [
    { questionId: 'height_cm', answer: '165', value: '165' },
    { questionId: 'weight_kg', answer: '68', value: '68' },
    { questionId: 'bp_known', answer: 'No', value: 'no' },
    { questionId: 'smoking', answer: 'Never', value: 'never' },
    { questionId: 'current_medications', answer: 'None' },
    { questionId: 'allergies', answer: 'None' },
    { questionId: 'has_uterus', answer: 'Yes', value: 'yes' },
    { questionId: 'last_period', answer: 'Within the last 12 months', value: 'within_12m' },
    { questionId: 'current_hrt', answer: 'No', value: 'no' },
    { questionId: 'migraine_aura', answer: 'No', value: 'no' },
    { questionId: 'liver_disease', answer: 'No', value: 'no' },
    { questionId: 'family_vte', answer: 'No', value: 'no' },
    { questionId: 'family_breast_cancer', answer: 'No', value: 'no' },
  ];

  const validInput = {
    firstName: ' Nora ',
    lastName: ' Aliu ',
    email: ' Nora@Example.com ',
    dateOfBirth: new Date('1990-01-01'),
    plan: 'GLP1',
    onboardingCompleted: true,
    quizAnswers: GLP1_ANSWERS,
  };

  function build() {
    const tx = {
      lead: { create: jest.fn().mockResolvedValue({ id: 'lead-1' }) },
      patient: { create: jest.fn().mockResolvedValue({ id: 'p-new' }) },
      onboardingSubmission: { create: jest.fn().mockResolvedValue({}) },
      consultation: { create: jest.fn().mockResolvedValue({ id: 'c-1' }) },
      product: { findUnique: jest.fn(({ where }: any) => Promise.resolve(CATALOG[where.slug] ?? null)) },
    };
    const prisma = {
      patient: { findUnique: jest.fn().mockResolvedValue(null) },
      lead: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const posthog = { capture: jest.fn() };
    const consents = {
      current: jest.fn().mockReturnValue({ version: 'v1' }),
      record: jest.fn().mockResolvedValue({}),
    };
    const prescribing = { issue: jest.fn().mockResolvedValue({ id: 'rx-1' }) };
    const svc = new PatientsService(prisma as any, audit as any, posthog as any, consents as any, prescribing as any);
    return { svc, prisma, tx, audit, posthog, consents, prescribing };
  }

  it('rejects an email already used by an existing patient or lead', async () => {
    const { svc, prisma } = build();
    prisma.patient.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(svc.createByStaff('admin-1', validInput as any)).rejects.toThrow(/already exists/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates a lead + patient and issues a starter GLP1 prescription when onboarding is completed', async () => {
    const { svc, tx, consents, prescribing, audit } = build();
    await svc.createByStaff('admin-1', validInput as any);

    expect(tx.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: 'nora@example.com', productKind: 'GLP1', quizAnswers: [] }),
    });
    expect(tx.patient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ firstName: 'Nora', lastName: 'Aliu', leadId: 'lead-1' }),
    });
    expect(tx.onboardingSubmission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'APPROVED', personaStatus: 'VERIFIED', photoReviewStatus: 'APPROVED' }),
    });
    expect(consents.record).toHaveBeenCalledWith('p-new', 'TELEHEALTH', 'v1', {}, tx);
    expect(prescribing.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: 'p-new',
        prescriberId: 'admin-1',
        kind: 'GLP1',
        items: [{ productId: 'prod-glp1', strengthId: 'str-glp1-0.25', quantity: 1, directions: 'Inject weekly' }],
      }),
      tx,
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PATIENT_CREATED_BY_STAFF', resourceId: 'p-new' }));
  });

  it('returns a readable generated password when none is given, storing only its bcrypt hash', async () => {
    const { svc, tx } = build();
    const result = await svc.createByStaff('admin-1', validInput as any);

    expect(result.temporaryPassword).toMatch(/^[A-Za-z0-9]{12}$/);
    const { passwordHash } = tx.patient.create.mock.calls[0][0].data;
    expect(passwordHash).toMatch(/^\$2[aby]\$/);
    expect(passwordHash).not.toContain(result.temporaryPassword);
  });

  it('uses an admin-supplied password instead of generating one', async () => {
    const { svc, tx } = build();
    const result = await svc.createByStaff('admin-1', { ...validInput, password: ' Sup3rSecret! ' } as any);

    expect(result.temporaryPassword).toBe('Sup3rSecret!');
    const { passwordHash } = tx.patient.create.mock.calls[0][0].data;
    expect(bcrypt.compareSync('Sup3rSecret!', passwordHash)).toBe(true);
  });

  it('rejects a supplied password shorter than 8 characters', async () => {
    const { svc, prisma } = build();
    await expect(svc.createByStaff('admin-1', { ...validInput, password: 'short' } as any)).rejects.toThrow(/at least 8 characters/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('bundles an estrogen and a progestogen for an HRT starter prescription', async () => {
    const { svc, prescribing } = build();
    await svc.createByStaff('admin-1', { ...validInput, plan: 'HRT', quizAnswers: HRT_ANSWERS } as any);

    expect(prescribing.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          { productId: 'prod-estrogen', strengthId: 'str-estrogen', quantity: 1, directions: 'Apply daily' },
          { productId: 'prod-progestogen', strengthId: 'str-progestogen', quantity: 1, directions: 'Take nightly' },
        ],
      }),
      expect.anything(),
    );
  });

  it('creates only the lead and patient, with no onboarding or prescription, when onboardingCompleted is false', async () => {
    const { svc, tx, consents, prescribing } = build();
    await svc.createByStaff('admin-1', { ...validInput, onboardingCompleted: false } as any);

    expect(tx.lead.create).toHaveBeenCalled();
    expect(tx.patient.create).toHaveBeenCalled();
    expect(tx.onboardingSubmission.create).not.toHaveBeenCalled();
    expect(tx.consultation.create).not.toHaveBeenCalled();
    expect(consents.record).not.toHaveBeenCalled();
    expect(prescribing.issue).not.toHaveBeenCalled();
  });

  it('rejects someone under 18', async () => {
    const { svc } = build();
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    await expect(svc.createByStaff('admin-1', { ...validInput, dateOfBirth: tenYearsAgo } as any)).rejects.toThrow(/at least 18/);
  });

  it('rejects a required intake question left unanswered when onboarding is completed', async () => {
    const { svc, prisma } = build();
    const incomplete = GLP1_ANSWERS.filter((a) => a.questionId !== 'smoking');
    await expect(svc.createByStaff('admin-1', { ...validInput, quizAnswers: incomplete } as any)).rejects.toThrow(/Do you smoke/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('records the onboarding question and the quiz answers on the onboarding submission and consultation', async () => {
    const { svc, tx, prescribing } = build();
    await svc.createByStaff('admin-1', { ...validInput, priorMedicationUse: true } as any);

    expect(tx.onboardingSubmission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ priorMedicationUse: true }),
    });
    expect(tx.consultation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        questionnaireVersion: 'GLP1-intake@1',
        quizAnswers: expect.arrayContaining([expect.objectContaining({ questionId: 'smoking', value: 'never' })]),
        redFlags: { create: expect.any(Array) },
      }),
    });
    expect(prescribing.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: expect.arrayContaining([expect.objectContaining({ questionId: 'smoking', value: 'never' })]),
      }),
      tx,
    );
  });
});
