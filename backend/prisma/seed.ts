import { PrismaClient, ConsultationStatus, ConsultationKind, RedFlagSeverity, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { seedCatalog } from './catalog';
import { dosePattern, nextDoseDates } from '../src/dosing/dose-pattern';

const prisma = new PrismaClient();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const hash = (pw: string) => bcrypt.hash(pw, 10);
// UTC midnight: a date of birth is a calendar date, not a moment in local time.
const dob = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

// ─── Quiz answers ─────────────────────────────────────────────────────────────

const HRT_QUIZ = [
  { questionId: 'hrt_1', question: 'Are you currently experiencing hot flushes?', answer: 'Yes, frequently' },
  { questionId: 'hrt_2', question: 'How would you describe your sleep quality?', answer: 'Poor – waking frequently' },
  { questionId: 'hrt_3', question: 'Have you been diagnosed with breast cancer?', answer: 'No' },
  { questionId: 'hrt_4', question: 'Do you have a history of blood clots?', answer: 'No' },
  { questionId: 'hrt_5', question: 'Are you currently pregnant or breastfeeding?', answer: 'No' },
];

const GLP1_QUIZ = [
  { questionId: 'glp_1', question: 'What is your current BMI?', answer: '34.2' },
  { questionId: 'glp_2', question: 'Have you tried other weight-loss methods?', answer: 'Yes – diet and exercise for 12+ months' },
  { questionId: 'glp_3', question: 'Do you have Type 2 diabetes?', answer: 'No' },
  { questionId: 'glp_4', question: 'Do you have a personal or family history of medullary thyroid cancer?', answer: 'No' },
  { questionId: 'glp_5', question: 'Do you have pancreatitis or severe GI disease?', answer: 'No' },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding database…\n');

  const productCount = await seedCatalog(prisma);
  console.log(`✓ Catalog  ${productCount} products`);

  // ── Clinicians ──────────────────────────────────────────────────────────────
  const pw = await hash('password123');

  const [admin, doctor, cx, provider] = await Promise.all([
    prisma.clinician.upsert({
      where: { email: 'admin@clinic.dev' },
      update: {},
      create: { email: 'admin@clinic.dev', passwordHash: pw, firstName: 'Alice', lastName: 'Admin', role: 'ADMIN' },
    }),
    prisma.clinician.upsert({
      where: { email: 'doctor@clinic.dev' },
      update: {},
      create: { email: 'doctor@clinic.dev', passwordHash: pw, firstName: 'David', lastName: 'Chen', role: 'DOCTOR', licenseNumber: 'KS-MED-7654321', licensingBody: 'Kosovo Chamber of Physicians', isVerified: true, verifiedAt: new Date() },
    }),
    prisma.clinician.upsert({
      where: { email: 'cx@clinic.dev' },
      update: {},
      create: { email: 'cx@clinic.dev', passwordHash: pw, firstName: 'Clara', lastName: 'Watson', role: 'CX_TEAM' },
    }),
    prisma.clinician.upsert({
      where: { email: 'provider@clinic.dev' },
      update: {},
      create: { email: 'provider@clinic.dev', passwordHash: pw, firstName: 'Peter', lastName: 'Supply', role: 'PROVIDER' },
    }),
  ]);
  console.log('✓ Clinicians  admin / doctor / cx / provider  (all password: password123)');

  // ── Leads ───────────────────────────────────────────────────────────────────
  // 3 unconverted leads, 2 converted (will become patients below)

  const leadSarah = await prisma.lead.upsert({
    where: { email: 'sarah.jones@example.com' },
    update: {},
    create: {
      email: 'sarah.jones@example.com',
      firstName: 'Sarah',
      lastName: 'Jones',
      productKind: ConsultationKind.HRT,
      quizAnswers: HRT_QUIZ,
      createdAt: daysAgo(5),
    },
  });

  const leadMark = await prisma.lead.upsert({
    where: { email: 'mark.taylor@example.com' },
    update: {},
    create: {
      email: 'mark.taylor@example.com',
      firstName: 'Mark',
      lastName: 'Taylor',
      productKind: ConsultationKind.GLP1,
      quizAnswers: GLP1_QUIZ,
      stripeSessionId: 'cs_test_abandoned_001',
      createdAt: daysAgo(3),
    },
  });

  const leadNina = await prisma.lead.upsert({
    where: { email: 'nina.patel@example.com' },
    update: {},
    create: {
      email: 'nina.patel@example.com',
      firstName: 'Nina',
      lastName: 'Patel',
      productKind: ConsultationKind.HRT,
      quizAnswers: HRT_QUIZ,
      createdAt: daysAgo(1),
    },
  });

  // Two leads that paid and converted
  const leadEmma = await prisma.lead.upsert({
    where: { email: 'emma.white@example.com' },
    update: {},
    create: {
      email: 'emma.white@example.com',
      firstName: 'Emma',
      lastName: 'White',
      productKind: ConsultationKind.HRT,
      quizAnswers: HRT_QUIZ,
      stripeSessionId: 'cs_test_paid_001',
      convertedAt: daysAgo(10),
      createdAt: daysAgo(12),
    },
  });

  const leadJames = await prisma.lead.upsert({
    where: { email: 'james.brook@example.com' },
    update: {},
    create: {
      email: 'james.brook@example.com',
      firstName: 'James',
      lastName: 'Brook',
      productKind: ConsultationKind.GLP1,
      quizAnswers: GLP1_QUIZ,
      stripeSessionId: 'cs_test_paid_002',
      convertedAt: daysAgo(7),
      createdAt: daysAgo(8),
    },
  });

  console.log('✓ Leads  (3 unconverted, 2 converted)');

  // ── Patients ────────────────────────────────────────────────────────────────
  // Emma — activated patient (HRT)
  const patientEmma = await prisma.patient.upsert({
    where: { email: 'emma.white@example.com' },
    update: {},
    create: {
      email: 'emma.white@example.com',
      passwordHash: pw,
      firstName: 'Emma',
      lastName: 'White',
      dateOfBirth: dob(1978, 4, 14),
      leadId: leadEmma.id,
      activatedAt: daysAgo(9),
      phone: '+383 44 123 456',
      addressLine1: 'Rruga Nëna Terezë 12',
      city: 'Prishtinë',
      postcode: '10000',
      country: 'Kosovo',
      createdAt: daysAgo(10),
    },
  });

  // James — paid but hasn't clicked the activation link yet
  const patientJames = await prisma.patient.upsert({
    where: { email: 'james.brook@example.com' },
    update: {},
    create: {
      email: 'james.brook@example.com',
      passwordHash: pw,
      firstName: 'James',
      lastName: 'Brook',
      dateOfBirth: dob(1985, 9, 3),
      leadId: leadJames.id,
      activationToken: 'dev-activation-token-james',
      activationTokenExpiresAt: new Date(Date.now() + 7 * 86_400_000),
      createdAt: daysAgo(7),
    },
  });

  // Emma's identity checks are done, so her pending consultation can be prescribed.
  // James has no onboarding yet — approving his consultation is blocked until he does.
  await prisma.onboardingSubmission.upsert({
    where: { patientId: patientEmma.id },
    update: {},
    create: {
      patientId: patientEmma.id,
      personaStatus: 'VERIFIED',
      photoReviewStatus: 'APPROVED',
      priorMedicationUse: false,
      status: 'APPROVED',
      submittedAt: daysAgo(9),
      reviewedAt: daysAgo(8),
      reviewedByClinicianId: doctor.id,
    },
  });

  console.log('✓ Patients  emma (activated, onboarding approved) / james (pending activation)');

  // ── Sofia — weight-management (GLP-1) patient with a Weight Journey ─────────
  // Fully set up: paid, activated, onboarding approved, consultation approved with an
  // intake weight, an active prescription, a goal, and two completed monthly check-ins.
  // Journey: start 120 kg → 114 → 109 kg at the monthly check-ins, then daily weights down to 107.6 kg
  // (target 90 kg). Her next check-in is
  // due in ~10 days — reschedule it in the clinician portal (Patients → Check-in) to test.
  const leadSofia = await prisma.lead.upsert({
    where: { email: 'sofia.meyer@example.com' },
    update: {},
    create: {
      email: 'sofia.meyer@example.com',
      firstName: 'Sofia',
      lastName: 'Meyer',
      productKind: ConsultationKind.GLP1,
      quizAnswers: GLP1_QUIZ,
      stripeSessionId: 'cs_test_paid_003',
      convertedAt: daysAgo(80),
      createdAt: daysAgo(82),
    },
  });

  const patientSofia = await prisma.patient.upsert({
    where: { email: 'sofia.meyer@example.com' },
    update: {},
    create: {
      email: 'sofia.meyer@example.com',
      passwordHash: pw,
      firstName: 'Sofia',
      lastName: 'Meyer',
      dateOfBirth: dob(1988, 11, 22),
      leadId: leadSofia.id,
      activatedAt: daysAgo(79),
      phone: '+383 44 987 654',
      addressLine1: 'Rruga Agim Ramadani 5',
      city: 'Prishtinë',
      postcode: '10000',
      country: 'Kosovo',
      createdAt: daysAgo(80),
    },
  });

  await prisma.onboardingSubmission.upsert({
    where: { patientId: patientSofia.id },
    update: {},
    create: {
      patientId: patientSofia.id,
      personaStatus: 'VERIFIED',
      photoReviewStatus: 'APPROVED',
      priorMedicationUse: false,
      status: 'APPROVED',
      submittedAt: daysAgo(79),
      reviewedAt: daysAgo(78),
      reviewedByClinicianId: doctor.id,
    },
  });

  const consultSofia = await prisma.consultation.upsert({
    where: { id: 'seed-consult-sofia-approved' },
    update: {},
    create: {
      id: 'seed-consult-sofia-approved',
      patientId: patientSofia.id,
      clinicianId: doctor.id,
      kind: ConsultationKind.GLP1,
      status: ConsultationStatus.APPROVED,
      quizAnswers: [
        ...GLP1_QUIZ,
        // Medical-intake answers, in the shape the questionnaire engine stores them.
        { questionId: 'height_cm', question: 'What is your height?', answer: '170 cm', value: '170', section: 'Weight management medical questionnaire' },
        { questionId: 'weight_kg', question: 'What is your current weight?', answer: '120 kg', value: '120', section: 'Weight management medical questionnaire' },
      ],
      submittedAt: daysAgo(78),
    },
  });

  // Sofia has been stepped up once (titration step 2), so she's the demo for the
  // missed-dose re-titration alert — her dose log below ends in two missed weeks.
  const glp1Product = await prisma.product.findFirst({
    where: { kind: ConsultationKind.GLP1, active: true },
    orderBy: { slug: 'desc' },
    include: { strengths: { where: { active: true, titrationStep: 2 }, take: 1 } },
  });
  const sofiaRx = await prisma.prescription.upsert({
    where: { consultationId: consultSofia.id },
    update: {},
    create: {
      consultationId: consultSofia.id,
      patientId: patientSofia.id,
      prescriberId: doctor.id,
      medication: glp1Product ? `${glp1Product.name} ${glp1Product.strengths[0]?.label ?? ''}`.trim() : 'Semaglutide (Wegovy) 0.5 mg',
      dosage: '0.5 mg once weekly',
      instructions: 'Inject subcutaneously once a week on the same day. Review dose after 4 weeks.',
      issuedAt: daysAgo(77),
      refillsAllowed: 5,
      ...(glp1Product?.strengths[0] && {
        items: {
          create: {
            productId: glp1Product.id,
            strengthId: glp1Product.strengths[0].id,
            quantity: 1,
            directions: 'Inject 0.5 mg subcutaneously once a week.',
          },
        },
      }),
      orders: {
        create: {
          patientId: patientSofia.id,
          sequence: 1,
          status: 'DELIVERED',
          pharmacyRef: 'PH-2026-00456',
          dispatchedAt: daysAgo(75),
          deliveredAt: daysAgo(73),
        },
      },
    },
  });

  // Weight Journey: the goal, and two completed (already reviewed) monthly check-ins.
  await prisma.weightGoal.upsert({
    where: { patientId: patientSofia.id },
    update: {},
    create: { patientId: patientSofia.id, startingWeightKg: 120, targetWeightKg: 90 },
  });

  const sofiaCheckIns = [
    { id: 'seed-checkin-sofia-1', daysAgo: 50, weightKg: 114, feeling: 'GREAT' as const, note: undefined },
    { id: 'seed-checkin-sofia-2', daysAgo: 20, weightKg: 109, feeling: 'GOOD' as const, note: 'A bit tired in the first week, much better now.' },
  ];
  for (const c of sofiaCheckIns) {
    const at = daysAgo(c.daysAgo);
    await prisma.checkIn.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        patientId: patientSofia.id,
        prescriptionId: sofiaRx.id,
        dueAt: at,
        status: 'COMPLETED',
        sentAt: at,
        completedAt: at,
        kind: ConsultationKind.GLP1,
        questionnaireVersion: 'GLP1-checkin@1',
        answers: [
          { questionId: 'weight_kg', question: 'What is your weight today?', answer: `${c.weightKg} kg`, value: String(c.weightKg), section: 'Monthly check-in' },
          ...(c.note ? [{ questionId: 'notes', question: 'Anything else you’d like your clinician to know?', answer: c.note, value: null, section: 'Monthly check-in' }] : []),
        ],
        weightKg: c.weightKg,
        feeling: c.feeling,
        wantsToReorder: true,
        reviewedAt: at,
        reviewedById: doctor.id,
        outcome: 'REPEAT',
        reviewNote: 'Good progress — continue current dose.',
        createdAt: at,
      },
    });
  }

  // Daily weights over the last two weeks — several on some days — so the chart, month history and
  // "current weight" have something to show. Fixed ids keep re-seeding from duplicating them.
  const dailyWeights: Array<[number, number, number, string?]> = [
    // [days ago, hour, kg, note]
    [13, 8, 109.0], [12, 8, 108.9], [11, 8, 108.9], [10, 8, 108.6], [9, 8, 108.7], [8, 7, 108.4],
    [7, 8, 108.5], [6, 8, 108.2], [5, 8, 108.3], [4, 8, 108.0], [3, 8, 107.9, 'Feeling lighter this week'],
    [2, 8, 108.1], [2, 20, 107.8], [1, 8, 107.7], [0, 7, 107.6],
  ];
  for (const [i, [ago, hour, kg, note]] of dailyWeights.entries()) {
    const at = daysAgo(ago);
    at.setUTCHours(hour, 15 + i, 0, 0);
    if (at.getTime() > Date.now()) at.setTime(Date.now() - 60_000); // "today" entries can't be in the future
    await prisma.weightEntry.upsert({
      where: { id: `seed-weight-sofia-${i + 1}` },
      update: {},
      create: { id: `seed-weight-sofia-${i + 1}`, patientId: patientSofia.id, weightKg: kg, measuredAt: at, note: note ?? null },
    });
  }

  console.log('✓ Sofia  GLP-1 patient (activated, onboarding approved, weight journey: 120 → 107.6 kg, target 90 kg, 15 daily weights)');

  // ── Consultations ───────────────────────────────────────────────────────────
  // Emma has 2 consultations in various states
  const consultApproved = await prisma.consultation.upsert({
    where: { id: 'seed-consult-emma-approved' },
    update: {},
    create: {
      id: 'seed-consult-emma-approved',
      patientId: patientEmma.id,
      clinicianId: doctor.id,
      kind: ConsultationKind.HRT,
      status: ConsultationStatus.APPROVED,
      quizAnswers: HRT_QUIZ,
      submittedAt: daysAgo(8),
    },
  });

  const consultSubmitted = await prisma.consultation.upsert({
    where: { id: 'seed-consult-emma-submitted' },
    update: {},
    create: {
      id: 'seed-consult-emma-submitted',
      patientId: patientEmma.id,
      kind: ConsultationKind.HRT,
      status: ConsultationStatus.SUBMITTED,
      quizAnswers: HRT_QUIZ,
      submittedAt: daysAgo(1),
    },
  });

  // James has 1 consultation in review with a red flag
  const consultInReview = await prisma.consultation.upsert({
    where: { id: 'seed-consult-james-review' },
    update: {},
    create: {
      id: 'seed-consult-james-review',
      patientId: patientJames.id,
      clinicianId: doctor.id,
      kind: ConsultationKind.GLP1,
      status: ConsultationStatus.IN_REVIEW,
      quizAnswers: GLP1_QUIZ,
      submittedAt: daysAgo(6),
    },
  });

  console.log('✓ Consultations  (approved, submitted, in-review)');

  // ── Red flags ───────────────────────────────────────────────────────────────
  await prisma.redFlag.upsert({
    where: { id: 'seed-redflag-001' },
    update: {},
    create: {
      id: 'seed-redflag-001',
      consultationId: consultInReview.id,
      description: 'BMI over 30 with reported history of GERD — monitor for GI side effects',
      severity: RedFlagSeverity.WARNING,
    },
  });

  console.log('✓ Red flags');

  // ── Prescription ────────────────────────────────────────────────────────────
  // Structured (a real PrescriptionItem, not just the free-text medication/dosage
  // summary) so it drives a dose calendar, repeats, and everything else built on
  // top of prescribing — not just a display-only legacy row.
  const oestrogel = await prisma.product.findUniqueOrThrow({ where: { slug: 'estradiol-gel-oestrogel' } });
  const oestrogelStrength = await prisma.productStrength.findFirstOrThrow({
    where: { productId: oestrogel.id, label: '0.75 mg per pump' },
  });

  // A prescription seeded before structured prescribing existed has no items —
  // `update: {}` below leaves an existing row untouched, so replace that legacy
  // shape once rather than leaving it stuck with no dose calendar forever.
  const existingRx = await prisma.prescription.findUnique({ where: { consultationId: consultApproved.id }, include: { items: true } });
  if (existingRx && existingRx.items.length === 0) {
    await prisma.order.deleteMany({ where: { prescriptionId: existingRx.id } });
    await prisma.prescription.delete({ where: { id: existingRx.id } });
  }

  const rxIssuedAt = daysAgo(7);
  const emmaPrescription = await prisma.prescription.upsert({
    where: { consultationId: consultApproved.id },
    update: {},
    create: {
      consultationId: consultApproved.id,
      medication: 'Estradiol gel 0.06% (Oestrogel)',
      dosage: '0.75 mg per pump × 1',
      instructions: 'Apply 2 pumps once daily to the outer arm or inner thigh. Let it dry before dressing; do not apply to the breasts.\nReview after 3 months.',
      issuedAt: rxIssuedAt,
      validUntil: new Date(rxIssuedAt.getTime() + 180 * 86_400_000),
      refillsAllowed: 5,
      patientId: patientEmma.id,
      prescriberId: doctor.id,
      items: {
        create: {
          productId: oestrogel.id,
          strengthId: oestrogelStrength.id,
          quantity: 1,
          directions: 'Apply 2 pumps once daily to the outer arm or inner thigh.',
        },
      },
      orders: {
        create: {
          patientId: patientEmma.id,
          sequence: 1,
          status: 'DISPATCHED',
          pharmacyRef: 'PH-2026-00123',
          dispatchedAt: daysAgo(6),
        },
      },
    },
    include: { items: true },
  });

  // Daily dose calendar: the last week mostly logged (one missed, for
  // realism), today's still open, and a week ahead scheduled — so "My doses"
  // has something to show immediately rather than an empty state.
  const emmaItem = emmaPrescription.items[0];
  // Dates are relative to today, so only write them once — a re-run would add a second set.
  if (emmaItem && !(await prisma.doseEvent.count({ where: { prescriptionItemId: emmaItem.id } }))) {
    const doseDates = Array.from({ length: 15 }, (_, i) => new Date(rxIssuedAt.getTime() + i * 86_400_000));
    await prisma.doseEvent.createMany({
      skipDuplicates: true,
      data: doseDates.map((scheduledFor, i) => {
        const daysFromToday = Math.round((scheduledFor.getTime() - Date.now()) / 86_400_000);
        const status = daysFromToday > 0 ? 'SCHEDULED' : i === 2 ? 'MISSED' : daysFromToday === 0 ? 'SCHEDULED' : 'TAKEN';
        return {
          prescriptionItemId: emmaItem.id,
          patientId: patientEmma.id,
          scheduledFor,
          status,
          takenAt: status === 'TAKEN' ? new Date(scheduledFor.getTime() + 30 * 60_000) : null,
        };
      }),
    });
  }

  console.log('✓ Prescriptions');

  // ── Demo data for dose tracking and symptom features ────────────────────────
  // Only written when the item has no doses yet, so re-running the seed on an
  // existing database never piles up duplicate calendars.

  // Sofia: weekly GLP-1 doses from her issue date — taken, then the last two
  // missed, so she shows the "missed doses" banner and the clinician alert.
  const sofiaItem = await prisma.prescriptionItem.findFirst({ where: { prescriptionId: sofiaRx.id } });
  if (sofiaItem && !(await prisma.doseEvent.count({ where: { prescriptionItemId: sofiaItem.id } }))) {
    const weekly = Array.from({ length: 15 }, (_, i) => new Date(sofiaRx.issuedAt.getTime() + i * 7 * 86_400_000));
    const past = weekly.filter((d) => d.getTime() < Date.now() - 86_400_000);
    await prisma.doseEvent.createMany({
      data: weekly.map((scheduledFor) => {
        const index = past.findIndex((d) => d.getTime() === scheduledFor.getTime());
        const status = index === -1 ? 'SCHEDULED' : index >= past.length - 2 ? 'MISSED' : 'TAKEN';
        return {
          prescriptionItemId: sofiaItem.id,
          patientId: patientSofia.id,
          scheduledFor,
          status,
          takenAt: status === 'TAKEN' ? new Date(scheduledFor.getTime() + 60 * 60_000) : null,
        };
      }),
    });
  }

  // Lina — HRT for three months on a twice-weekly estradiol patch plus nightly
  // progesterone, with a symptom history that improves on treatment.
  const patientLina = await prisma.patient.upsert({
    where: { email: 'lina.krasniqi@example.com' },
    update: {},
    create: {
      email: 'lina.krasniqi@example.com',
      passwordHash: pw,
      firstName: 'Lina',
      lastName: 'Krasniqi',
      dateOfBirth: dob(1972, 11, 2),
      activatedAt: daysAgo(96),
      phone: '+383 44 555 010',
      addressLine1: 'Rruga Agim Ramadani 7',
      city: 'Prishtinë',
      postcode: '10000',
      country: 'Kosovo',
      createdAt: daysAgo(97),
    },
  });
  await prisma.onboardingSubmission.upsert({
    where: { patientId: patientLina.id },
    update: {},
    create: {
      patientId: patientLina.id,
      personaStatus: 'VERIFIED',
      photoReviewStatus: 'APPROVED',
      priorMedicationUse: false,
      status: 'APPROVED',
      submittedAt: daysAgo(96),
      reviewedAt: daysAgo(95),
      reviewedByClinicianId: doctor.id,
    },
  });
  const consultLina = await prisma.consultation.upsert({
    where: { id: 'seed-consult-lina-approved' },
    update: {},
    create: {
      id: 'seed-consult-lina-approved',
      patientId: patientLina.id,
      clinicianId: doctor.id,
      kind: ConsultationKind.HRT,
      status: ConsultationStatus.APPROVED,
      quizAnswers: HRT_QUIZ,
      submittedAt: daysAgo(95),
    },
  });

  const patch = await prisma.product.findUnique({ where: { slug: 'estradiol-patch-evorel' }, include: { strengths: true } });
  const progesterone = await prisma.product.findUnique({ where: { slug: 'progesterone-utrogestan' }, include: { strengths: true } });
  const patchStrength = patch?.strengths.find((st) => st.label === '50 micrograms/24 h');
  if (patch && patchStrength && progesterone?.strengths[0]) {
    const linaIssuedAt = daysAgo(92);
    const linaRx = await prisma.prescription.upsert({
      where: { consultationId: consultLina.id },
      update: {},
      create: {
        consultationId: consultLina.id,
        patientId: patientLina.id,
        prescriberId: doctor.id,
        medication: 'Estradiol patch 50 micrograms/24 h (Evorel) + Micronised progesterone 100 mg (Utrogestan)',
        dosage: 'One patch twice a week; one capsule nightly',
        instructions: 'Change the patch twice a week on the same two days, on a different spot below the waist each time. Take progesterone at bedtime every night.',
        issuedAt: linaIssuedAt,
        validUntil: new Date(linaIssuedAt.getTime() + 180 * 86_400_000),
        refillsAllowed: 5,
        items: {
          create: [
            { productId: patch.id, strengthId: patchStrength.id, quantity: 1, directions: 'Apply one patch twice a week.' },
            { productId: progesterone.id, strengthId: progesterone.strengths[0].id, quantity: 1, directions: 'Take one capsule at bedtime every night.' },
          ],
        },
        orders: {
          create: [
            { patientId: patientLina.id, sequence: 1, status: 'DELIVERED', pharmacyRef: 'PH-2026-00301', dispatchedAt: daysAgo(90), deliveredAt: daysAgo(88) },
            { patientId: patientLina.id, sequence: 2, status: 'DELIVERED', pharmacyRef: 'PH-2026-00377', dispatchedAt: daysAgo(34), deliveredAt: daysAgo(32) },
          ],
        },
      },
      include: { items: { include: { product: true } } },
    });

    // Up to ~a week ahead of today, generated the same way the app does it
    // (patches pinned to the same two weekdays), past doses mostly logged.
    for (const item of linaRx.items) {
      if (await prisma.doseEvent.count({ where: { prescriptionItemId: item.id } })) continue;
      const pattern = dosePattern(item.product);
      if (!pattern) continue;
      const until = Date.now() + 7 * 86_400_000;
      const dates = nextDoseDates(pattern, linaIssuedAt, null, 200).filter((d) => d.getTime() <= until);
      await prisma.doseEvent.createMany({
        data: dates.map((scheduledFor, i) => {
          const due = scheduledFor.getTime() < Date.now() - 86_400_000;
          const status = !due ? 'SCHEDULED' : i % 17 === 5 ? 'MISSED' : 'TAKEN';
          return {
            prescriptionItemId: item.id,
            patientId: patientLina.id,
            scheduledFor,
            status,
            takenAt: status === 'TAKEN' ? new Date(scheduledFor.getTime() + 45 * 60_000) : null,
          };
        }),
      });
    }
  }

  // Monthly Menopause Rating Scale scores: severe at the start, mild now.
  const MRS_ITEMS = ['hot_flushes', 'heart_discomfort', 'sleep', 'depressive_mood', 'irritability', 'anxiety', 'exhaustion', 'sexual', 'bladder', 'vaginal_dryness', 'joint_muscle'];
  const linaScores: { daysAgo: number; scores: number[] }[] = [
    { daysAgo: 93, scores: [4, 2, 4, 3, 3, 2, 3, 2, 1, 2, 3] },
    { daysAgo: 62, scores: [3, 1, 3, 2, 2, 2, 2, 2, 1, 2, 2] },
    { daysAgo: 31, scores: [2, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2] },
    { daysAgo: 3, scores: [1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1] },
  ];
  for (const [n, entry] of linaScores.entries()) {
    const answers = MRS_ITEMS.map((itemId, i) => ({ itemId, score: entry.scores[i] }));
    await prisma.symptomAssessment.upsert({
      where: { id: `seed-symptoms-lina-${n + 1}` },
      update: {},
      create: {
        id: `seed-symptoms-lina-${n + 1}`,
        patientId: patientLina.id,
        scale: 'MRS',
        answers,
        totalScore: entry.scores.reduce((a, b) => a + b, 0),
        recordedAt: daysAgo(entry.daysAgo),
      },
    });
  }

  console.log('✓ Demo  Sofia missed doses (step 2) / Lina patch + progesterone + symptom history');

  // ── Messages ────────────────────────────────────────────────────────────────
  await prisma.message.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'seed-msg-001',
        consultationId: consultApproved.id,
        senderId: patientEmma.id,
        senderRole: Role.PATIENT,
        content: 'Hi, I just wanted to check — is it normal to feel a bit tired in the first week?',
        sentAt: daysAgo(7),
      },
      {
        id: 'seed-msg-002',
        consultationId: consultApproved.id,
        senderId: doctor.id,
        senderRole: Role.CLINICIAN,
        content: 'Yes, mild fatigue in the first week is completely normal as your body adjusts. If it persists beyond 2 weeks please let us know.',
        sentAt: daysAgo(6),
      },
      {
        id: 'seed-msg-003',
        consultationId: consultInReview.id,
        senderId: doctor.id,
        senderRole: Role.CLINICIAN,
        content: 'We noticed a flag on your file regarding GERD history. Could you let us know if you are currently on any medication for this?',
        sentAt: daysAgo(5),
      },
    ],
  });

  console.log('✓ Messages');
  console.log('\n✅ Seed complete.\n');
  console.log('Login credentials (all passwords: password123)');
  console.log('─────────────────────────────────────────────');
  console.log('  admin@clinic.dev     → Admin (full access)');
  console.log('  doctor@clinic.dev    → Doctor (patients, review queue)');
  console.log('  cx@clinic.dev        → CX Team (leads, patients)');
  console.log('  provider@clinic.dev  → Provider (patients, orders)');
  console.log('');
  console.log('Patients (patient portal)');
  console.log('  sofia.meyer@example.com   → GLP-1 at step 2, Weight Journey, last two doses missed (banner + clinician alert)');
  console.log('  emma.white@example.com    → HRT, onboarding done, no symptom scores yet');
  console.log('  lina.krasniqi@example.com → HRT patch + progesterone, 3 months of symptom scores');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
