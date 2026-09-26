import { PrismaClient, ConsultationStatus, ConsultationKind, RedFlagSeverity, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const hash = (pw: string) => bcrypt.hash(pw, 10);
const dob = (year: number, month: number, day: number) => new Date(year, month - 1, day);
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
      create: { email: 'doctor@clinic.dev', passwordHash: pw, firstName: 'David', lastName: 'Chen', role: 'DOCTOR', gmcNumber: 'GMC7654321' },
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

  console.log('✓ Patients  emma (activated) / james (pending activation)');

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
  await prisma.prescription.upsert({
    where: { consultationId: consultApproved.id },
    update: {},
    create: {
      consultationId: consultApproved.id,
      medication: 'Oestraclin Gel 0.06%',
      dosage: '1 sachet (1.25g) daily',
      instructions: 'Apply to inner arm or thigh, rotate sites daily. Review after 3 months.',
      issuedAt: daysAgo(7),
      pharmacyRef: 'PH-2026-00123',
      dispatchedAt: daysAgo(6),
    },
  });

  console.log('✓ Prescriptions');

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
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
