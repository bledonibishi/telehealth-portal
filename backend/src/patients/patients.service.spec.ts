import * as bcrypt from 'bcryptjs';
import { PatientsService } from './patients.service';

// findAll/updateMyBasicInfo only touch prisma (and, for findAll, the weight
// journey) — the other constructor deps (audit, posthog, consents, prescribing)
// are only exercised by createByStaff, below.
const noJourneys = () => ({ summariesFor: jest.fn().mockResolvedValue(new Map()) });
const noopDeps = (journey: any = noJourneys()) =>
  [{ log: jest.fn() } as any, { capture: jest.fn() } as any, {} as any, {} as any, journey, {} as any] as const;

describe('PatientsService.findAll', () => {
  const row = (over: Partial<any> = {}) => ({
    id: 'p-1',
    firstName: 'Emma',
    lead: { productKind: 'HRT' },
    activatedAt: new Date('2026-09-01'),
    consultations: [{ status: 'APPROVED', kind: 'HRT', messages: [] }],
    prescriptions: [{ id: 'rx-1', medication: 'Oestrogel', dosage: '0.75 mg', items: [] }],
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

  it('marks a patient whose every consultation was declined as Declined, not Inactive', async () => {
    const statusOf = async (over: Partial<any>) => {
      const prisma = { patient: { findMany: jest.fn().mockResolvedValue([row({ prescriptions: [], ...over })]) } };
      const [result] = await new PatientsService(prisma as any, ...noopDeps()).findAll();
      return result.treatmentStatus;
    };
    expect(await statusOf({ consultations: [{ status: 'DECLINED', kind: 'GLP1', messages: [] }] })).toBe('DECLINED');
    // Still Inactive when something else is open, or there is no consultation yet.
    expect(await statusOf({ consultations: [{ status: 'DECLINED', kind: 'GLP1', messages: [] }, { status: 'SUBMITTED', kind: 'GLP1', messages: [] }] })).toBe('INACTIVE');
    expect(await statusOf({ consultations: [] })).toBe('INACTIVE');
    // A declined second request doesn't mark someone who is on treatment.
    expect(await statusOf({ consultations: [{ status: 'DECLINED', kind: 'GLP1', messages: [] }], prescriptions: [{ id: 'rx', medication: 'x', dosage: 'y', items: [] }] })).toBe('ACTIVE');
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

  it('names the medication after the brand, with the prescribed strength', async () => {
    const items = [{ product: { name: 'Semaglutide', brandName: 'Wegovy' }, strength: { label: '0.5 mg' } }];
    const prisma = { patient: { findMany: jest.fn().mockResolvedValue([row({ prescriptions: [{ id: 'rx-1', medication: 'x', dosage: 'y', items }] })]) } };
    const [result] = await new PatientsService(prisma as any, ...noopDeps()).findAll();
    expect(result.medications).toEqual([{ label: 'Wegovy', dose: '0.5 mg' }]);
  });

  it('falls back to the prescription summary when it has no items', async () => {
    const prisma = { patient: { findMany: jest.fn().mockResolvedValue([row()]) } };
    const [result] = await new PatientsService(prisma as any, ...noopDeps()).findAll();
    expect(result.medications).toEqual([{ label: 'Oestrogel', dose: '0.75 mg' }]);
  });

  it('is ACTIVE with a prescription, INACTIVE without one and PENDING before activation', async () => {
    const prisma = {
      patient: {
        findMany: jest.fn().mockResolvedValue([row(), row({ prescriptions: [] }), row({ activatedAt: null })]),
      },
    };
    const result = await new PatientsService(prisma as any, ...noopDeps()).findAll();
    expect(result.map((r) => r.treatmentStatus)).toEqual(['ACTIVE', 'INACTIVE', 'PENDING']);
  });

  it('takes the weight numbers from the weight journey, for weight programmes only', async () => {
    const journey = {
      summariesFor: jest.fn().mockResolvedValue(
        new Map([['p-1', { startingWeightKg: 100, currentWeightKg: 92, targetWeightKg: 85, weightLostKg: 8, progressPercentage: 53.33, latestMeasurementAt: new Date('2026-09-20') }]]),
      ),
    };
    const prisma = {
      patient: {
        findMany: jest.fn().mockResolvedValue([
          row({ lead: { productKind: 'GLP1' } }),
          row({ id: 'p-2', lead: { productKind: 'HRT' } }),
        ]),
      },
    };
    const [glp1, hrt] = await new PatientsService(prisma as any, ...noopDeps(journey)).findAll();

    expect(journey.summariesFor).toHaveBeenCalledWith(['p-1']);
    expect(glp1).toMatchObject({ weightLostKg: 8, targetWeightKg: 85, progressPercentage: 53.33, lastWeighedAt: new Date('2026-09-20') });
    expect(hrt).toMatchObject({ weightLostKg: null, progressPercentage: null, lastWeighedAt: null });
  });

  it('flags a patient whose newest message is unanswered', async () => {
    const at = (d: string) => new Date(d);
    const thread = (...m: [string, string][]) => ({ status: 'APPROVED', kind: 'GLP1', messages: [{ senderRole: m[0][0], sentAt: at(m[0][1]) }] });
    const prisma = {
      patient: {
        findMany: jest.fn().mockResolvedValue([
          row({ consultations: [thread(['PATIENT', '2026-09-20'])] }),
          row({ consultations: [thread(['CLINICIAN', '2026-09-21'])] }),
          // Patient wrote last in an older thread, but staff replied since in the newer one.
          row({ consultations: [thread(['CLINICIAN', '2026-09-22']), thread(['PATIENT', '2026-09-10'])] }),
        ]),
      },
    };
    const result = await new PatientsService(prisma as any, ...noopDeps()).findAll();
    expect(result.map((r) => r.awaitingReply)).toEqual([true, false, false]);
    expect(result[0].lastMessageAt).toEqual(at('2026-09-20'));
  });

  it('queries every consultation (newest first), the latest check-in only, and only active prescriptions', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const deps = noopDeps();
    await new PatientsService({ patient: { findMany } } as any, ...deps).findAll();

    const { include } = findMany.mock.calls[0][0];
    expect(include.consultations).toMatchObject({ orderBy: { submittedAt: 'desc' } });
    expect(include.consultations).not.toHaveProperty('take');
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
      name: 'Semaglutide',
      brandName: 'Wegovy',
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
    const submitIntakeQuiz = jest.fn().mockResolvedValue({ id: 'c-2' });
    const moduleRef = { get: jest.fn().mockReturnValue({ submitIntakeQuiz }) };
    const svc = new PatientsService(prisma as any, audit as any, posthog as any, consents as any, prescribing as any, {} as any, moduleRef as any);
    return { svc, prisma, tx, audit, posthog, consents, prescribing, submitIntakeQuiz };
  }

  it('turns medical answers entered with onboarding left to the patient into their consultation, so onboarding doesn’t ask again', async () => {
    const { svc, tx, submitIntakeQuiz, audit } = build();
    await svc.createByStaff('admin-1', { ...validInput, onboardingCompleted: false } as any);
    expect(tx.onboardingSubmission.create).not.toHaveBeenCalled();
    expect(submitIntakeQuiz).toHaveBeenCalledWith('p-new', expect.objectContaining({ kind: 'GLP1', answers: GLP1_ANSWERS, telehealthConsentVersion: 'v1' }), {});
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ intakeSubmitted: true }) }));
  });

  it('still creates the patient, and says nothing failed, when the consultation can’t be created', async () => {
    const { svc, submitIntakeQuiz, audit } = build();
    submitIntakeQuiz.mockRejectedValue(new Error('boom'));
    const result = await svc.createByStaff('admin-1', { ...validInput, onboardingCompleted: false } as any);
    expect(result.temporaryPassword).toBeTruthy();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ intakeSubmitted: false }) }));
  });

  it('leaves the questionnaire to the patient when none was entered', async () => {
    const { svc, submitIntakeQuiz } = build();
    await svc.createByStaff('admin-1', { ...validInput, onboardingCompleted: false, quizAnswers: [] } as any);
    expect(submitIntakeQuiz).not.toHaveBeenCalled();
  });

  it('refuses incomplete medical answers before creating anything', async () => {
    const { svc, tx } = build();
    await expect(svc.createByStaff('admin-1', { ...validInput, onboardingCompleted: false, quizAnswers: GLP1_ANSWERS.slice(2) } as any)).rejects.toThrow(/height|weight/i);
    expect(tx.patient.create).not.toHaveBeenCalled();
  });

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
      data: expect.objectContaining({
        email: 'nora@example.com',
        productKind: 'GLP1',
        quizAnswers: [expect.objectContaining({ questionId: 'preferred_treatment', answer: expect.stringContaining('0.25 mg') })],
      }),
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
        questionnaireVersion: 'GLP1-intake@2',
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
