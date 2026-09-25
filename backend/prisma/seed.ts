import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Relative date helper — keeps seed data always "fresh" relative to today
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  console.log('Seeding database...');

  // ─── Clinicians ───────────────────────────────────────────────────────────
  const alice = await prisma.clinician.upsert({
    where: { email: 'alice.smith@clinic.dev' },
    update: {},
    create: {
      email: 'alice.smith@clinic.dev',
      passwordHash: await bcrypt.hash('Password123!', 10),
      firstName: 'Alice',
      lastName: 'Smith',
      gmcNumber: 'GMC1234567',
      isVerified: true,
      mfaEnabled: false,
    },
  });

  const bob = await prisma.clinician.upsert({
    where: { email: 'bob.jones@clinic.dev' },
    update: {},
    create: {
      email: 'bob.jones@clinic.dev',
      passwordHash: await bcrypt.hash('Password123!', 10),
      firstName: 'Bob',
      lastName: 'Jones',
      gmcNumber: 'GMC7654321',
      isVerified: true,
      mfaEnabled: false,
    },
  });

  console.log(`Clinicians: ${alice.email}, ${bob.email}`);

  // ─── Patients ─────────────────────────────────────────────────────────────
  const patient1 = await prisma.patient.upsert({
    where: { email: 'jane.doe@patient.dev' },
    update: {},
    create: {
      email: 'jane.doe@patient.dev',
      passwordHash: await bcrypt.hash('Password123!', 10),
      firstName: 'Jane',
      lastName: 'Doe',
      dateOfBirth: new Date('1980-04-15'),
    },
  });

  const patient2 = await prisma.patient.upsert({
    where: { email: 'sarah.miller@patient.dev' },
    update: {},
    create: {
      email: 'sarah.miller@patient.dev',
      passwordHash: await bcrypt.hash('Password123!', 10),
      firstName: 'Sarah',
      lastName: 'Miller',
      dateOfBirth: new Date('1975-09-22'),
    },
  });

  const patient3 = await prisma.patient.upsert({
    where: { email: 'emily.clark@patient.dev' },
    update: {},
    create: {
      email: 'emily.clark@patient.dev',
      passwordHash: await bcrypt.hash('Password123!', 10),
      firstName: 'Emily',
      lastName: 'Clark',
      dateOfBirth: new Date('1990-01-30'),
    },
  });

  console.log(`Patients: ${patient1.email}, ${patient2.email}, ${patient3.email}`);

  // ─── Consultation 1: HRT, submitted 2 days ago, has warning red flag ───────
  const consultation1 = await prisma.consultation.upsert({
    where: { id: 'seed-consultation-1' },
    update: { submittedAt: daysAgo(2) },
    create: {
      id: 'seed-consultation-1',
      patientId: patient1.id,
      kind: 'HRT',
      status: 'SUBMITTED',
      submittedAt: daysAgo(2),
      quizAnswers: [
        { questionId: 'active_cancer', question: 'Have you been diagnosed with any active cancer?', answer: 'no' },
        { questionId: 'blood_clots_history', question: 'Do you have a history of blood clots?', answer: 'no' },
        { questionId: 'unexplained_bleeding', question: 'Are you experiencing unexplained vaginal bleeding?', answer: 'no' },
        { questionId: 'recent_heart_attack', question: 'Have you had a heart attack or stroke in the last 12 months?', answer: 'no' },
        { questionId: 'liver_disease', question: 'Do you have liver disease?', answer: 'yes' },
        { questionId: 'uncontrolled_hypertension', question: 'Do you have uncontrolled high blood pressure?', answer: 'no' },
        { questionId: 'main_symptoms', question: 'What are your main symptoms?', answer: 'Hot flushes' },
        { questionId: 'last_period', question: 'When was your last period?', answer: '1–2 years ago' },
      ],
      redFlags: {
        create: [
          { description: 'Liver disease reported', severity: 'WARNING' },
        ],
      },
    },
  });

  // ─── Consultation 2: HRT, in review 5 days ago, critical red flag ──────────
  const consultation2 = await prisma.consultation.upsert({
    where: { id: 'seed-consultation-2' },
    update: { submittedAt: daysAgo(5) },
    create: {
      id: 'seed-consultation-2',
      patientId: patient2.id,
      clinicianId: alice.id,
      kind: 'HRT',
      status: 'IN_REVIEW',
      submittedAt: daysAgo(5),
      quizAnswers: [
        { questionId: 'active_cancer', question: 'Have you been diagnosed with any active cancer?', answer: 'no' },
        { questionId: 'blood_clots_history', question: 'Do you have a history of blood clots?', answer: 'yes' },
        { questionId: 'unexplained_bleeding', question: 'Are you experiencing unexplained vaginal bleeding?', answer: 'no' },
        { questionId: 'recent_heart_attack', question: 'Have you had a heart attack or stroke in the last 12 months?', answer: 'no' },
        { questionId: 'liver_disease', question: 'Do you have liver disease?', answer: 'no' },
        { questionId: 'uncontrolled_hypertension', question: 'Do you have uncontrolled high blood pressure?', answer: 'no' },
        { questionId: 'main_symptoms', question: 'What are your main symptoms?', answer: 'Night sweats' },
        { questionId: 'last_period', question: 'When was your last period?', answer: 'More than 2 years ago' },
      ],
      redFlags: {
        create: [
          { description: 'History of blood clots or DVT reported', severity: 'CRITICAL' },
        ],
      },
    },
  });

  // ─── Consultation 3: HRT, more info requested 10 days ago, with messages ───
  const consultation3 = await prisma.consultation.upsert({
    where: { id: 'seed-consultation-3' },
    update: { submittedAt: daysAgo(10) },
    create: {
      id: 'seed-consultation-3',
      patientId: patient3.id,
      clinicianId: bob.id,
      kind: 'HRT',
      status: 'MORE_INFO_REQUESTED',
      submittedAt: daysAgo(10),
      quizAnswers: [
        { questionId: 'active_cancer', question: 'Have you been diagnosed with any active cancer?', answer: 'no' },
        { questionId: 'blood_clots_history', question: 'Do you have a history of blood clots?', answer: 'no' },
        { questionId: 'unexplained_bleeding', question: 'Are you experiencing unexplained vaginal bleeding?', answer: 'no' },
        { questionId: 'recent_heart_attack', question: 'Have you had a heart attack or stroke in the last 12 months?', answer: 'no' },
        { questionId: 'liver_disease', question: 'Do you have liver disease?', answer: 'no' },
        { questionId: 'uncontrolled_hypertension', question: 'Do you have uncontrolled high blood pressure?', answer: 'no' },
        { questionId: 'main_symptoms', question: 'What are your main symptoms?', answer: 'Multiple' },
        { questionId: 'last_period', question: 'When was your last period?', answer: 'Within the last 12 months' },
      ],
    },
  });

  // Messages on consultation 3
  await prisma.message.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'seed-msg-1',
        consultationId: consultation3.id,
        senderId: bob.id,
        senderRole: 'CLINICIAN',
        content: 'Hi Emily, could you clarify which symptoms you are experiencing? You selected "Multiple" — please list them so I can review your case fully.',
      },
      {
        id: 'seed-msg-2',
        consultationId: consultation3.id,
        senderId: patient3.id,
        senderRole: 'PATIENT',
        content: 'Hi Dr Jones, I have been experiencing hot flushes, mood swings, and disrupted sleep for about 6 months now.',
      },
    ],
  });

  // ─── Consultation 4: HRT, approved 30 days ago with prescription ───────────
  const consultation4 = await prisma.consultation.upsert({
    where: { id: 'seed-consultation-4' },
    update: { submittedAt: daysAgo(30) },
    create: {
      id: 'seed-consultation-4',
      patientId: patient1.id,
      clinicianId: alice.id,
      kind: 'HRT',
      status: 'APPROVED',
      submittedAt: daysAgo(30),
      quizAnswers: [
        { questionId: 'active_cancer', question: 'Have you been diagnosed with any active cancer?', answer: 'no' },
        { questionId: 'blood_clots_history', question: 'Do you have a history of blood clots?', answer: 'no' },
        { questionId: 'main_symptoms', question: 'What are your main symptoms?', answer: 'Hot flushes' },
        { questionId: 'last_period', question: 'When was your last period?', answer: 'More than 2 years ago' },
      ],
      prescription: {
        create: {
          medication: 'Estradiol',
          dosage: '1mg daily',
          instructions: 'Take one tablet daily at the same time each day. Review after 3 months.',
        },
      },
    },
  });

  // ─── Audit log entries ────────────────────────────────────────────────────
  await prisma.auditLogEntry.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'seed-audit-1',
        actorId: patient1.id,
        actorRole: 'PATIENT',
        action: 'CONSULTATION_SUBMITTED',
        resourceType: 'Consultation',
        resourceId: consultation1.id,
      },
      {
        id: 'seed-audit-2',
        actorId: alice.id,
        actorRole: 'CLINICIAN',
        action: 'CONSULTATION_APPROVED',
        resourceType: 'Consultation',
        resourceId: consultation4.id,
        metadata: { medication: 'Estradiol', dosage: '1mg daily' },
      },
      {
        id: 'seed-audit-3',
        actorId: bob.id,
        actorRole: 'CLINICIAN',
        action: 'CONSULTATION_MORE_INFO_REQUESTED',
        resourceType: 'Consultation',
        resourceId: consultation3.id,
      },
    ],
  });

  console.log('Seed complete.');
  console.log('');
  console.log('─── Clinician logins ───────────────────────────────');
  console.log('  alice.smith@clinic.dev  /  Password123!');
  console.log('  bob.jones@clinic.dev    /  Password123!');
  console.log('─── What you get in the queue ──────────────────────');
  console.log('  • Jane Doe      — HRT, SUBMITTED, warning flag');
  console.log('  • Sarah Miller  — HRT, IN_REVIEW, CRITICAL flag (pinned top)');
  console.log('  • Emily Clark   — HRT, MORE_INFO_REQUESTED, messages');
  console.log('  • Jane Doe      — HRT, APPROVED (prior consultation)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
