/**
 * Dev only: example records for trying the newer screens without building the data by hand.
 *
 *   cd backend
 *   pnpm seed-examples            # replaces earlier examples with fresh ones and lists what to try
 *   pnpm seed-examples --clear    # removes the examples again
 *
 * Everything it makes belongs to an address like demo.something@example.com, and nothing else is touched. Needs the
 * normal seed to have run first (the catalog and doctor@clinic.dev). Uses DATABASE_URL from the environment, or else
 * from backend/.env, and refuses to run against a database that isn't on this machine. example.com can't receive mail.
 */
import { existsSync } from 'fs';
import { resolve } from 'path';
import * as bcrypt from 'bcryptjs';
import { Prisma, PrismaClient } from '@prisma/client';
import { findQuestionnaire, type Question } from '../src/questionnaires/definitions';
import { evaluateAnswers } from '../src/questionnaires/evaluate';
import { triageEligibility } from '../src/questionnaires/triage';

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const inDays = (n: number) => new Date(Date.now() + n * DAY);
const DEMO = { startsWith: 'demo.' } as const;

type Kind = 'HRT' | 'GLP1';
type Stage = 'ELIGIBILITY' | 'INTAKE' | 'CHECKIN';

/**
 * Answers a questionnaire the way a healthy person would (the first option with no flag on it), with `pick` choosing
 * any answer for a question by its id, then checks them the way the server does so they are always valid.
 */
function answersFor(kind: Kind, stage: Stage, pick: Record<string, string> = {}) {
  const questionnaire = findQuestionnaire(kind as any, stage);
  const chosen: Record<string, string[]> = {};
  const submitted: Array<{ questionId: string; answer: string; value: string }> = [];
  for (const q of questionnaire.questions as Question[]) {
    if (q.showIf && !(chosen[q.showIf.questionId] ?? []).some((v) => q.showIf!.anyOf.includes(v))) continue;
    let value: string | undefined = pick[q.id];
    if (value === undefined) {
      if (q.type === 'single') value = (q.options?.find((o) => !o.flag) ?? q.options?.[0])?.value;
      else if (q.type === 'multi') value = (q.options?.find((o) => !o.flag && !o.exclusive) ?? q.options?.find((o) => !o.flag) ?? q.options?.[0])?.value;
      else if (q.type === 'number') value = String(q.min ?? 0);
      else value = q.quickAnswer ?? 'None';
    }
    if (value === undefined) continue;
    chosen[q.id] = value.split('|');
    submitted.push({ questionId: q.id, answer: value, value });
  }
  const result = evaluateAnswers(questionnaire, submitted, true);
  if (result.errors.length) throw new Error(`Example ${kind} ${stage} answers were refused: ${result.errors.join(' ')}`);
  return { answers: result.answers, flags: result.flags, version: `${kind}-${stage.toLowerCase()}@${questionnaire.version}` };
}

/** The shape the website saves its eligibility answers in. */
const eligibility = (kind: Kind, pick: Record<string, string> = {}) =>
  answersFor(kind, 'ELIGIBILITY', pick).answers.map((a) => ({ questionId: a.questionId, question: a.question, answer: a.answer }));
const intake = (kind: Kind, pick: Record<string, string> = {}) =>
  answersFor(kind, 'INTAKE', pick).answers.map((a) => ({ questionId: a.questionId, answer: a.answer, value: a.value ?? null }));

async function main() {
  const envFile = resolve(__dirname, '../.env');
  if (!process.env.DATABASE_URL && existsSync(envFile)) {
    (process as unknown as { loadEnvFile(path: string): void }).loadEnvFile(envFile);
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('Not available in production.');
    process.exit(1);
  }
  const host = new URL(process.env.DATABASE_URL ?? 'postgresql://unset').hostname;
  if (!['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host)) {
    console.error(`DATABASE_URL points at "${host}", not this machine. Refusing to write examples there.`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    // ── Clear the earlier examples (only the demo.* ones) ───────────────────────
    const patients = await prisma.patient.findMany({ where: { email: DEMO }, select: { id: true } });
    const ids = patients.map((p) => p.id);
    if (ids.length) {
      // A prescription that replaced another points back at it, so those links go first.
      await prisma.prescription.updateMany({ where: { patientId: { in: ids } }, data: { supersedesId: null } });
      await prisma.$transaction([
        prisma.orderTrackingEvent.deleteMany({ where: { order: { patientId: { in: ids } } } }),
        prisma.partnerTransmission.deleteMany({ where: { order: { patientId: { in: ids } } } }),
        prisma.order.deleteMany({ where: { patientId: { in: ids } } }),
        prisma.checkIn.deleteMany({ where: { patientId: { in: ids } } }),
        prisma.labResult.deleteMany({ where: { patientId: { in: ids } } }),
        prisma.labReport.deleteMany({ where: { patientId: { in: ids } } }),
        prisma.uploadedFile.deleteMany({ where: { patientId: { in: ids } } }),
        prisma.doseEvent.deleteMany({ where: { patientId: { in: ids } } }),
        prisma.notification.deleteMany({ where: { patientId: { in: ids } } }),
        prisma.prescriptionItem.deleteMany({ where: { prescription: { patientId: { in: ids } } } }),
        prisma.prescription.deleteMany({ where: { patientId: { in: ids } } }),
        prisma.message.deleteMany({ where: { patientId: { in: ids } } }),
        prisma.consultation.deleteMany({ where: { patientId: { in: ids } } }),
        prisma.onboardingSubmission.deleteMany({ where: { patientId: { in: ids } } }),
        prisma.patient.deleteMany({ where: { id: { in: ids } } }),
      ]);
    }
    const removedLeads = await prisma.lead.deleteMany({ where: { email: DEMO } });
    if (ids.length || removedLeads.count) console.log(`Removed earlier examples (${ids.length} patients, ${removedLeads.count} leads).`);
    if (process.argv.includes('--clear')) return;

    const doctor = await prisma.clinician.findUnique({ where: { email: 'doctor@clinic.dev' } });
    const evorel = await prisma.product.findUnique({ where: { slug: 'estradiol-patch-evorel' }, include: { strengths: true } });
    const utrogestan = await prisma.product.findUnique({ where: { slug: 'progesterone-utrogestan' }, include: { strengths: true } });
    const glp1 = await prisma.product.findFirst({ where: { kind: 'GLP1', active: true }, orderBy: { slug: 'desc' }, include: { strengths: { where: { active: true, titrationStep: 2 }, take: 1 } } });
    const evorelStrength = evorel?.strengths.find((s) => s.label.startsWith('100'));
    const utroStrength = utrogestan?.strengths.find((s) => s.label.startsWith('100'));
    if (!doctor || !evorel || !evorelStrength || !utrogestan || !utroStrength || !glp1?.strengths[0]) {
      console.error('The catalog or doctor@clinic.dev is missing. Run the normal seed first: pnpm prisma:seed');
      process.exit(1);
    }
    const passwordHash = await bcrypt.hash('password123', 10);

    // ── Leads who never paid: for the Leads page and the returning-visitor choice on the website ─────────────────
    const ok = eligibility('HRT');
    const lead = (email: string, first: string, last: string, create: Partial<Prisma.LeadUncheckedCreateInput>) =>
      prisma.lead.create({ data: { email, firstName: first, lastName: last, productKind: 'HRT', quizAnswers: ok, ...create } });

    await lead('demo.returning@example.com', 'Rina', 'Returning', {
      intakeAnswers: intake('HRT'), intakeConsentVersion: '1', intakeSavedAt: daysAgo(14), createdAt: daysAgo(14), updatedAt: daysAgo(14),
    });
    await lead('demo.stale@example.com', 'Stela', 'Stale', {
      intakeAnswers: intake('HRT'), intakeConsentVersion: '1', intakeSavedAt: daysAgo(45), createdAt: daysAgo(45), updatedAt: daysAgo(45),
    });
    await lead('demo.checkout@example.com', 'Celina', 'Checkout', {
      intakeAnswers: intake('HRT'), intakeConsentVersion: '1', intakeSavedAt: daysAgo(6), createdAt: daysAgo(6), updatedAt: daysAgo(3),
      checkoutDetails: { name: 'Celina Checkout', line1: 'Rr. Demo 1', city: 'Prizren', postalCode: '20000', country: 'Kosovo' },
      reminderCount: 1, lastReminderAt: daysAgo(3), referralCode: 'DEMO-FRIEND',
    });
    await lead('demo.quizonly@example.com', 'Quira', 'Quizonly', { createdAt: daysAgo(2), updatedAt: daysAgo(2) });
    await lead('demo.stopped@example.com', 'Stefi', 'Stopped', {
      intakeAnswers: intake('HRT'), intakeConsentVersion: '1', intakeSavedAt: daysAgo(9), createdAt: daysAgo(9), updatedAt: daysAgo(9),
      reminderCount: 1, lastReminderAt: daysAgo(7), remindersStoppedAt: daysAgo(7),
    });
    const ruledOut = eligibility('HRT', { medical_history: 'breast_cancer' });
    if (triageEligibility('HRT' as any, ruledOut as any).riskTag !== 'RED') console.warn('Note: the "ruled out" example lead did not come out as high risk; check the option value.');
    await lead('demo.ruledout@example.com', 'Rhea', 'Ruledout', { quizAnswers: ruledOut, intakeAnswers: intake('HRT'), intakeConsentVersion: '1', intakeSavedAt: daysAgo(5), createdAt: daysAgo(5), updatedAt: daysAgo(5) });

    // ── Alma: HRT patient with a chain of prescriptions, check-ins and lab results ───────────────────────────
    const address = { addressLine1: 'Rruga Demo 12', city: 'Prishtinë', postcode: '10000', country: 'Kosovo', phone: '+383 44 000 111' };
    const alma = await prisma.patient.create({
      data: { email: 'demo.alma@example.com', passwordHash, firstName: 'Alma', lastName: 'Demo', dateOfBirth: new Date(Date.UTC(1974, 2, 9)), gender: 'FEMALE', activatedAt: daysAgo(80), createdAt: daysAgo(82), ...address },
    });
    await prisma.onboardingSubmission.create({
      data: { patientId: alma.id, personaStatus: 'VERIFIED', photoReviewStatus: 'APPROVED', priorMedicationUse: false, status: 'APPROVED', submittedAt: daysAgo(80), reviewedAt: daysAgo(79), reviewedByClinicianId: doctor.id },
    });
    const almaConsult = await prisma.consultation.create({
      data: { patientId: alma.id, clinicianId: doctor.id, kind: 'HRT', status: 'APPROVED', quizAnswers: intake('HRT'), questionnaireVersion: answersFor('HRT', 'INTAKE').version, submittedAt: daysAgo(79) },
    });

    const items = (productStrengths: Array<[string, string, string]>) => ({
      create: productStrengths.map(([productId, strengthId, directions]) => ({ productId, strengthId, quantity: 1, directions })),
    });
    const evorelDir = 'Apply one patch twice a week to clean, dry skin below the waist, changing the patch every 3–4 days.';
    const utroDir = 'Take one capsule by mouth at bedtime every night (continuous regimen).';
    const both = (): [string, string, string][] => [[evorel.id, evorelStrength.id, evorelDir], [utrogestan.id, utroStrength.id, utroDir]];
    const rx = (issuedDaysAgo: number, status: 'ACTIVE' | 'SUPERSEDED', supersedesId?: string) =>
      prisma.prescription.create({
        data: {
          patientId: alma.id, prescriberId: doctor.id, status, supersedesId,
          medication: 'Estradiol patch (Evorel) + Micronised progesterone (Utrogestan)', dosage: '100 micrograms/24 h × 1 + 100 mg × 1',
          instructions: `${evorelDir}\n${utroDir}`, issuedAt: daysAgo(issuedDaysAgo), validUntil: inDays(30 - issuedDaysAgo), refillsAllowed: 0,
          items: items(both()),
        },
      });
    const rxA = await rx(75, 'SUPERSEDED');
    const rxB = await rx(43, 'SUPERSEDED', rxA.id);
    const rxC = await rx(13, 'ACTIVE', rxB.id);

    const order = (prescriptionId: string, over: Partial<Prisma.OrderUncheckedCreateInput>) =>
      prisma.order.create({ data: { prescriptionId, patientId: alma.id, sequence: 1, ...over } });
    const delivered = (dispatchedDaysAgo: number) => ({ status: 'DELIVERED' as const, dispatchedAt: daysAgo(dispatchedDaysAgo), deliveredAt: daysAgo(dispatchedDaysAgo - 2), pharmacyRef: 'DEMO-PH' });
    await order(rxA.id, delivered(73));
    const orderB = await order(rxB.id, delivered(41));
    // Waiting for the pharmacy: the one to try "Process now" on (Prescriptions tab, development only).
    const orderC = await order(rxC.id, {});

    const checkin = (sequence: number, prescriptionId: string, completedDaysAgo: number, result: { rx: string; order: string }) => {
      const at = daysAgo(completedDaysAgo);
      const a = answersFor('HRT', 'CHECKIN', { symptom_control: 'better' });
      return prisma.checkIn.create({
        data: {
          patientId: alma.id, prescriptionId, dueAt: daysAgo(completedDaysAgo + 1), status: 'COMPLETED', sentAt: daysAgo(completedDaysAgo + 1), completedAt: at,
          kind: 'HRT', questionnaireVersion: a.version, answers: a.answers as any, redFlags: a.flags as any, wantsToReorder: true, feeling: 'GOOD',
          reviewedAt: daysAgo(completedDaysAgo - 1), reviewedById: doctor.id, outcome: 'NEW_PRESCRIPTION',
          reviewNote: `Symptoms improving — continue (check-in ${sequence}).`, billingNote: 'Billing active', resultPrescriptionId: result.rx, resultOrderId: result.order, createdAt: at,
        },
      });
    };
    await checkin(1, rxA.id, 44, { rx: rxB.id, order: orderB.id });
    await checkin(2, rxB.id, 14, { rx: rxC.id, order: orderC.id });
    // The next one, still to come.
    await prisma.checkIn.create({ data: { patientId: alma.id, dueAt: inDays(14), status: 'SCHEDULED' } });

    const lab = (kind: string, value: number, unit: string, low: number | null, high: number | null, ago: number, extra: Partial<Prisma.LabResultUncheckedCreateInput> = {}) => {
      const flagged = (low != null && value < low) || (high != null && value > high);
      return prisma.labResult.create({
        data: { patientId: alma.id, kind: kind as any, value, unit, referenceRangeLow: low, referenceRangeHigh: high, flagged, collectedAt: daysAgo(ago), enteredById: doctor.id, ...extra },
      });
    };
    const reviewed = { reviewedAt: daysAgo(250), reviewedById: doctor.id, reviewNote: 'Low before treatment, as expected.' };
    await lab('ESTRADIOL', 62, 'pmol/L', 100, 700, 260, reviewed);
    await lab('ESTRADIOL', 210, 'pmol/L', 100, 700, 170);
    await lab('ESTRADIOL', 340, 'pmol/L', 100, 700, 80);
    await lab('ESTRADIOL', 780, 'pmol/L', 100, 700, 6); // out of range and not reviewed: the red strip on the Labs tab
    await lab('FSH', 82, 'IU/L', 25.8, 134.8, 260);
    await lab('FSH', 47, 'IU/L', 25.8, 134.8, 80);
    await lab('OTHER', 48, 'nmol/L', 50, 125, 80, { analyteName: 'Vitamin D' });

    // ── Dren: GLP-1 patient whose monthly check-in is waiting for a doctor (flags, labs, weight) ──────────────
    const dren = await prisma.patient.create({
      data: { email: 'demo.dren@example.com', passwordHash, firstName: 'Dren', lastName: 'Demo', dateOfBirth: new Date(Date.UTC(1985, 6, 21)), gender: 'MALE', activatedAt: daysAgo(70), createdAt: daysAgo(72), ...address, addressLine1: 'Rruga Demo 40' },
    });
    await prisma.onboardingSubmission.create({
      data: { patientId: dren.id, personaStatus: 'VERIFIED', photoReviewStatus: 'APPROVED', priorMedicationUse: false, status: 'APPROVED', submittedAt: daysAgo(70), reviewedAt: daysAgo(69), reviewedByClinicianId: doctor.id },
    });
    const drenIntake = answersFor('GLP1', 'INTAKE', { weight_kg: '118', height_cm: '176' });
    const drenConsult = await prisma.consultation.create({
      data: { patientId: dren.id, clinicianId: doctor.id, kind: 'GLP1', status: 'APPROVED', quizAnswers: drenIntake.answers as any, questionnaireVersion: drenIntake.version, submittedAt: daysAgo(69) },
    });
    const drenRx = await prisma.prescription.create({
      data: {
        consultationId: drenConsult.id, patientId: dren.id, prescriberId: doctor.id, medication: `${glp1.name} ${glp1.strengths[0].label}`, dosage: `${glp1.strengths[0].label} once weekly`,
        instructions: 'Inject once a week on the same day.', issuedAt: daysAgo(40), validUntil: inDays(-10), refillsAllowed: 0,
        items: { create: { productId: glp1.id, strengthId: glp1.strengths[0].id, quantity: 1, directions: 'Inject once a week on the same day.' } },
        orders: { create: { patientId: dren.id, sequence: 1, status: 'DELIVERED', pharmacyRef: 'DEMO-PH', dispatchedAt: daysAgo(38), deliveredAt: daysAgo(36) } },
      },
    });
    const drenCheck = answersFor('GLP1', 'CHECKIN', { weight_kg: '109', doses_missed: '1', side_effect_impact: 'severe' });
    await prisma.checkIn.create({
      data: {
        patientId: dren.id, prescriptionId: drenRx.id, dueAt: daysAgo(3), status: 'COMPLETED', sentAt: daysAgo(3), completedAt: daysAgo(2), kind: 'GLP1', questionnaireVersion: drenCheck.version,
        answers: drenCheck.answers as any, redFlags: [...drenCheck.flags, { severity: 'WARNING', description: 'Severe side effects reported — consider holding rather than continuing to escalate' }] as any,
        wantsToReorder: true, weightKg: 109, feeling: 'OKAY', createdAt: daysAgo(2),
      },
    });
    await prisma.labResult.createMany({
      data: [
        { patientId: dren.id, kind: 'HBA1C', value: 41, unit: 'mmol/mol', referenceRangeLow: 20, referenceRangeHigh: 42, flagged: false, collectedAt: daysAgo(60), enteredById: doctor.id },
        { patientId: dren.id, kind: 'HBA1C', value: 36, unit: 'mmol/mol', referenceRangeLow: 20, referenceRangeHigh: 42, flagged: false, collectedAt: daysAgo(8), enteredById: doctor.id },
        { patientId: dren.id, kind: 'LIVER_FUNCTION', value: 71, unit: 'U/L', referenceRangeLow: 7, referenceRangeHigh: 56, flagged: true, collectedAt: daysAgo(8), enteredById: doctor.id },
      ],
    });

    // Messages from patients, for the AI helpers on the clinician side: translate, draft a reply, and the urgency mark.
    const say = (patientId: string, consultationId: string, content: string, ago: number, extra: Partial<Prisma.MessageUncheckedCreateInput> = {}) =>
      prisma.message.create({ data: { patientId, consultationId, senderId: patientId, senderRole: 'PATIENT', content, sentAt: new Date(Date.now() - ago * 3_600_000), ...extra } });
    await say(alma.id, almaConsult.id, 'Përshëndetje doktor. Flasteri më shkëputet shpesh nga lëkura kur bëj dush. A duhet ta ndërroj më herët se zakonisht?', 30);
    // This one is marked as the urgency check would mark it (the seed doesn't call the AI). A message sent from the patient portal is checked live.
    await say(alma.id, almaConsult.id, 'Since this morning I have a strong pain in my chest and it is hard to breathe. Should I keep wearing the patch?', 1, {
      aiUrgent: true, aiUrgentReason: 'chest pain and trouble breathing', aiCheckedAt: new Date(),
    });
    await say(dren.id, drenConsult.id, 'Mirëdita. Kam të vjella që prej dy ditësh dhe nuk po mbaj dot as ujë. Doza e radhës është të dielën, çfarë të bëj?', 5);
    await say(dren.id, drenConsult.id, 'Hello, when will my next order arrive? Thank you!', 2);

    console.log('\nExamples created. All patients sign in with password123. Staff: admin@clinic.dev / doctor@clinic.dev (password123).\n');
    console.log('LEADS PAGE (clinician → Leads)');
    console.log('  demo.returning@  quiz done 14 days ago, never paid        → the "Welcome back" choice on the website, earlier answers can be kept');
    console.log('  demo.stale@      health answers 45 days old               → shown, but "Keep my earlier answers" is blocked; checkout refuses them');
    console.log('  demo.checkout@   reached checkout, came back, 1 reminder  → "Back 3 days ago", delivery, referral code, reminders');
    console.log('  demo.quizonly@   quiz only, no health questions           → "Quiz only"');
    console.log('  demo.stopped@    asked to stop reminders                  → "Stopped by the lead"');
    console.log('  demo.ruledout@   a disqualifying answer                   → High risk badge, never reminded');
    console.log('\nTo see the website choice: take the quiz for HRT with an email above (the code is printed in the backend log with no Resend key, or set DISABLE_EMAIL_VERIFICATION=true), and answer something differently.');
    console.log('\nPATIENT: Alma Demo (demo.alma@) — Patients → Alma');
    console.log('  Prescriptions tab   three prescriptions chained A → B → C, each linked to its check-in and orders; copy the IDs and search them');
    console.log('  Orders              the newest prescription has a waiting order: press "Process now" (Prescriptions tab) to ship it as the pharmacy would');
    console.log('  Check-in tab        two completed and reviewed, one scheduled in 14 days: use Create link / Email link now / Send now');
    console.log('  Labs tab            estradiol trend (last value out of range, not reviewed), FSH, and Vitamin D as an "other" test');
    console.log('\nPATIENT: Dren Demo (demo.dren@) — Check-ins page, review queue');
    console.log('  A check-in waiting for a doctor with a side-effect flag, and the "Latest lab results" panel beside it (HbA1c, liver function out of range)');
    console.log('\nAI HELPERS (need ANTHROPIC_API_KEY in backend/.env; without it the buttons are simply not shown)');
    console.log('  Check-ins → Dren           "Summarise this check-in" writes the brief, with the record lines behind each bullet');
    console.log('  Patients → Alma → Messages   an Albanian message (try "Translate"), and one marked "Possibly urgent" (chest pain); try "Draft a reply"');
    console.log('  Patients → Dren → chat       an Albanian message about vomiting, and an English one about an order; "Draft a reply" answers the latest');
    console.log('  Patients page                "Ask in plain words": try "HRT patients waiting for a reply" or "GLP-1 patients who joined this month"');
    console.log('  A message you send from the patient portal as demo.alma@ is checked for urgency live; a doctor\'s reply is never checked');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
