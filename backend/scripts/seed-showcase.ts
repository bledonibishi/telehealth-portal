/**
 * Dev only: a large set of examples so every screen, in every role, has something to show.
 *
 *   cd backend
 *   pnpm seed-showcase            # replaces earlier showcase data with fresh data and prints what is where
 *   pnpm seed-showcase --clear    # removes it again
 *
 * Needs the normal seed first (pnpm prisma:seed: the catalog and the four base logins). Everything it makes belongs to an
 * address starting "showcase." (patients and leads), one of the staff addresses it lists, or a ticket starting
 * "[Showcase]", and nothing else is touched. All passwords are password123. Weight entries, consents and the audit log are
 * append-only in the database (a guard blocks deleting them), so this script never deletes them: the showcase patients and
 * staff stay in place and are updated, everything else about them is rebuilt, and those three kinds of rows are only added
 * once (running it again does not duplicate them). --clear therefore removes the showcase's other data but leaves the people. Uses DATABASE_URL from the environment, or
 * else from backend/.env, and refuses to run against a database that isn't on this machine. No photos are made, so the
 * onboarding photo tiles stay empty. Nothing here calls Stripe, the AI, or sends an email.
 */
import { existsSync } from 'fs';
import { resolve } from 'path';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { Prisma, PrismaClient } from '@prisma/client';
import { findQuestionnaire, type Question } from '../src/questionnaires/definitions';
import { evaluateAnswers } from '../src/questionnaires/evaluate';
import { CURRENT_CONSENTS } from '../src/consents/consent-texts';
import { ConsentType } from '../src/common/enums';
import { SCALES, domainScores as scaleDomains } from '../src/symptoms/symptom-scales';
import { DEFAULT_ARTICLES } from '../src/support-bot/support-knowledge';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const hoursAgo = (n: number) => new Date(Date.now() - n * HOUR);
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const inDays = (n: number) => new Date(Date.now() + n * DAY);
const SHOW = { startsWith: 'showcase.' } as const;
const TICKET_PREFIX = '[Showcase] ';
const STAFF_EMAILS = ['doctor2@clinic.dev', 'doctor3@clinic.dev', 'cx2@clinic.dev', 'cx3@clinic.dev', 'admin2@clinic.dev', 'provider2@clinic.dev', 'staff.deactivated@clinic.dev', 'staff.invited@clinic.dev'];

type Kind = 'HRT' | 'GLP1' | 'TRT';
type Stage = 'ELIGIBILITY' | 'INTAKE' | 'CHECKIN';

// ── Questionnaire answers: the way a healthy person would answer, with `pick` changing any one ─────────────────
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
const eligibility = (kind: Kind, pick: Record<string, string> = {}) => answersFor(kind, 'ELIGIBILITY', pick).answers.map((a) => ({ questionId: a.questionId, question: a.question, answer: a.answer }));
const intake = (kind: Kind, pick: Record<string, string> = {}) => answersFor(kind, 'INTAKE', pick).answers.map((a) => ({ questionId: a.questionId, answer: a.answer, value: a.value ?? null }));

// A small deterministic generator, so a re-run gives the same weights and scores.
let seedState = 42;
const rnd = () => ((seedState = (seedState * 1664525 + 1013904223) % 4294967296) / 4294967296);

async function main() {
  const envFile = resolve(__dirname, '../.env');
  if (!process.env.DATABASE_URL && existsSync(envFile)) (process as unknown as { loadEnvFile(path: string): void }).loadEnvFile(envFile);
  if (process.env.NODE_ENV === 'production') { console.error('Not available in production.'); process.exit(1); }
  const host = new URL(process.env.DATABASE_URL ?? 'postgresql://unset').hostname;
  if (!['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host)) {
    console.error(`DATABASE_URL points at "${host}", not this machine. Refusing to write examples there.`);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    await clear(prisma);
    if (process.argv.includes('--clear')) return;
    await build(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function clear(prisma: PrismaClient) {
  const patients = await prisma.patient.findMany({ where: { email: SHOW }, select: { id: true } });
  const ids = patients.map((p) => p.id);
  const staff = await prisma.clinician.findMany({ where: { email: { in: STAFF_EMAILS } }, select: { id: true } });
  const staffIds = staff.map((s) => s.id);
  await prisma.ticket.deleteMany({ where: { OR: [{ subject: { startsWith: TICKET_PREFIX } }, ...(ids.length ? [{ patientId: { in: ids } }] : [])] } });
  if (ids.length) {
    await prisma.prescription.updateMany({ where: { patientId: { in: ids } }, data: { supersedesId: null } });
    // A showcase patient who came from a showcase lead must let go of it before the lead can be removed.
    await prisma.patient.updateMany({ where: { id: { in: ids } }, data: { leadId: null } });
    await prisma.$transaction([
      prisma.supportThread.deleteMany({ where: { patientId: { in: ids } } }),
      prisma.voucher.deleteMany({ where: { patientId: { in: ids } } }),
      prisma.referral.deleteMany({ where: { OR: [{ referrerId: { in: ids } }, { referredPatientId: { in: ids } }] } }),
      prisma.appointmentRequest.deleteMany({ where: { patientId: { in: ids } } }),
      prisma.booking.deleteMany({ where: { patientId: { in: ids } } }),
      prisma.sideEffectReport.deleteMany({ where: { patientId: { in: ids } } }),
      prisma.sideEffectLog.deleteMany({ where: { patientId: { in: ids } } }),
      prisma.deviceConnection.deleteMany({ where: { patientId: { in: ids } } }),
      prisma.weightGoal.deleteMany({ where: { patientId: { in: ids } } }),
      prisma.bodyMeasurement.deleteMany({ where: { patientId: { in: ids } } }),
      prisma.symptomAssessment.deleteMany({ where: { patientId: { in: ids } } }),
      prisma.doseEvent.deleteMany({ where: { patientId: { in: ids } } }),
      prisma.checkIn.deleteMany({ where: { patientId: { in: ids } } }),
      prisma.labResult.deleteMany({ where: { patientId: { in: ids } } }),
      prisma.labReport.deleteMany({ where: { patientId: { in: ids } } }),
      prisma.orderTrackingEvent.deleteMany({ where: { order: { patientId: { in: ids } } } }),
      prisma.partnerTransmission.deleteMany({ where: { order: { patientId: { in: ids } } } }),
      prisma.order.deleteMany({ where: { patientId: { in: ids } } }),
      prisma.refillRequest.deleteMany({ where: { prescription: { patientId: { in: ids } } } }),
      prisma.prescriptionItem.deleteMany({ where: { prescription: { patientId: { in: ids } } } }),
      prisma.prescription.deleteMany({ where: { patientId: { in: ids } } }),
      prisma.message.deleteMany({ where: { patientId: { in: ids } } }),
      prisma.redFlag.deleteMany({ where: { consultation: { patientId: { in: ids } } } }),
      prisma.consultation.deleteMany({ where: { patientId: { in: ids } } }),
      prisma.onboardingSubmission.deleteMany({ where: { patientId: { in: ids } } }),
      prisma.uploadedFile.deleteMany({ where: { patientId: { in: ids } } }),
      prisma.notification.deleteMany({ where: { patientId: { in: ids } } }),
      prisma.refundRequest.deleteMany({ where: { patientId: { in: ids } } }),
    ]);
  }
  const leads = await prisma.lead.deleteMany({ where: { email: SHOW } });
  if (staffIds.length) {
    await prisma.notification.deleteMany({ where: { clinicianId: { in: staffIds } } });
  }
  if (ids.length || leads.count) console.log(`Cleared earlier showcase data for ${ids.length} patients and ${leads.count} leads (the people themselves stay).`);
}

async function build(prisma: PrismaClient) {
  const baseDoctor = await prisma.clinician.findUnique({ where: { email: 'doctor@clinic.dev' } });
  const baseCx = await prisma.clinician.findUnique({ where: { email: 'cx@clinic.dev' } });
  const baseAdmin = await prisma.clinician.findUnique({ where: { email: 'admin@clinic.dev' } });
  const products = await prisma.product.findMany({ include: { strengths: { orderBy: { sortOrder: 'asc' } } } });
  if (!baseDoctor || !baseCx || !baseAdmin || products.length === 0) {
    console.error('The catalog or the base logins are missing. Run the normal seed first: pnpm prisma:seed');
    process.exit(1);
  }
  const pw = await bcrypt.hash('password123', 10);

  // ── Staff, one of every kind, plus the awkward ones ──────────────────────────────────────────────────────────
  const staffRow = (email: string, firstName: string, lastName: string, role: 'ADMIN' | 'DOCTOR' | 'CX_TEAM' | 'PROVIDER', extra: Partial<Prisma.ClinicianUncheckedCreateInput> = {}) =>
    prisma.clinician.upsert({ where: { email }, create: { email, passwordHash: pw, firstName, lastName, role, ...extra }, update: { passwordHash: pw, firstName, lastName, role, ...extra } });
  const verified = { isVerified: true, verifiedAt: daysAgo(100), verifiedById: baseAdmin.id };
  const doctor2 = await staffRow('doctor2@clinic.dev', 'Elira', 'Gashi', 'DOCTOR', { licenseNumber: 'KS-MED-1002003', licensingBody: 'Kosovo Chamber of Physicians', ...verified, specialty: 'Endocrinology', bio: 'Hormone and weight-management specialist.', languages: ['sq', 'en'] });
  await staffRow('doctor3@clinic.dev', 'Arben', 'Krasniqi', 'DOCTOR', { specialty: 'General practice', languages: ['sq', 'en', 'de'] }); // not verified: cannot prescribe yet
  const cx2 = await staffRow('cx2@clinic.dev', 'Besa', 'Hoxha', 'CX_TEAM');
  await staffRow('cx3@clinic.dev', 'Flamur', 'Berisha', 'CX_TEAM');
  await staffRow('admin2@clinic.dev', 'Mira', 'Admin', 'ADMIN');
  await staffRow('provider2@clinic.dev', 'Pharmacy', 'Two', 'PROVIDER');
  await staffRow('staff.deactivated@clinic.dev', 'Former', 'Colleague', 'CX_TEAM', { deactivatedAt: daysAgo(20) });
  await staffRow('staff.invited@clinic.dev', 'Invited', 'Newcomer', 'DOCTOR', { passwordSetAt: null, inviteToken: crypto.randomBytes(24).toString('hex'), inviteTokenExpiresAt: inDays(5) });
  const doctors = [baseDoctor, doctor2];
  console.log('✓ Staff');

  // ── Catalog lookups ──────────────────────────────────────────────────────────────────────────────────────────
  const productBySlug = (slug: string) => {
    const p = products.find((x) => x.slug === slug);
    if (!p) throw new Error(`Product ${slug} is not in the catalog`);
    return p;
  };
  const strengthOf = (slug: string, pick: number | string) => {
    const p = productBySlug(slug);
    const s = typeof pick === 'number' ? p.strengths[Math.min(pick, p.strengths.length - 1)] : p.strengths.find((x) => x.label.startsWith(pick));
    if (!s) throw new Error(`No strength ${pick} on ${slug}`);
    return { product: p, strength: s };
  };

  // ── Builders ─────────────────────────────────────────────────────────────────────────────────────────────────
  const address = (city: string, n: number) => ({ addressLine1: `Rruga Showcase ${n}`, city, postcode: '10000', country: 'Kosovo', phone: `+383 44 ${String(100000 + n * 137).slice(0, 3)} ${String(100 + n)}` });
  type PatientOpts = { key: string; first: string; last: string; gender: 'FEMALE' | 'MALE'; born: number; createdAgo: number; activatedAgo?: number | null; city?: string; height?: number; extra?: Partial<Prisma.PatientUncheckedCreateInput> };
  let n = 0;
  const patient = (o: PatientOpts) => {
    n += 1;
    const email = `showcase.${o.key}@example.com`;
    const data = {
        email, passwordHash: pw, firstName: o.first, lastName: o.last, dateOfBirth: new Date(Date.UTC(o.born, n % 12, 1 + (n % 27))), gender: o.gender,
        activatedAt: o.activatedAgo === null ? null : daysAgo(o.activatedAgo ?? o.createdAgo - 1), createdAt: daysAgo(o.createdAgo), heightCm: o.height ?? null,
        ...address(o.city ?? 'Prishtinë', n), referralCode: `SHOW${String(n).padStart(3, '0')}`, activationToken: null, activationTokenExpiresAt: null, leadId: null, subscriptionEndedAt: null,
        ...(o.activatedAgo === null ? { activationToken: crypto.randomBytes(24).toString('hex'), activationTokenExpiresAt: inDays(2) } : {}),
        ...o.extra,
    } as Prisma.PatientUncheckedCreateInput;
    return prisma.patient.upsert({ where: { email }, create: data, update: data as Prisma.PatientUncheckedUpdateInput });
  };
  type P = Awaited<ReturnType<typeof patient>>;

  // Consents are append-only: add them only when the patient has none, so a re-run does not pile up copies.
  const consentFor = async (p: P, ago: number) => {
    if ((await prisma.consent.count({ where: { patientId: p.id } })) > 0) return;
    await prisma.consent.createMany({ data: Object.values(ConsentType).map((type) => ({ patientId: p.id, type, version: CURRENT_CONSENTS[type]?.version ?? '1', acceptedAt: daysAgo(ago) })) });
  };

  const onboarding = (p: P, status: 'IN_PROGRESS' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'DECLINED', ago: number, extra: Partial<Prisma.OnboardingSubmissionUncheckedCreateInput> = {}) =>
    prisma.onboardingSubmission.create({
      data: {
        patientId: p.id, status, personaStatus: status === 'IN_PROGRESS' ? 'PENDING' : 'VERIFIED', identityViaVerifyService: true,
        photoReviewStatus: status === 'APPROVED' ? 'APPROVED' : status === 'IN_PROGRESS' ? 'NOT_STARTED' : status === 'REJECTED' ? 'REJECTED' : 'PENDING_REVIEW',
        priorMedicationUse: false, submittedAt: status === 'IN_PROGRESS' ? null : daysAgo(ago),
        ...(status === 'APPROVED' || status === 'REJECTED' || status === 'DECLINED' ? { reviewedAt: daysAgo(ago - 1), reviewedByClinicianId: baseDoctor.id } : {}), ...extra,
      },
    });

  const consultation = (p: P, kind: Kind, status: 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'DECLINED' | 'MORE_INFO_REQUESTED', ago: number, o: { clinician?: { id: string } | null; pick?: Record<string, string>; declineReason?: string; refundStatus?: 'REFUNDED' | 'FAILED' | 'NOT_REQUIRED'; flags?: Array<{ severity: 'CRITICAL' | 'WARNING'; description: string }> } = {}) => {
    const a = answersFor(kind, 'INTAKE', o.pick);
    return prisma.consultation.create({
      data: {
        patientId: p.id, kind, status, quizAnswers: a.answers as any, questionnaireVersion: a.version, submittedAt: daysAgo(ago), clinicianId: status === 'SUBMITTED' ? null : (o.clinician ?? baseDoctor).id,
        declineReason: o.declineReason, refundStatus: o.refundStatus,
        redFlags: { create: [...a.flags.map((f: any) => ({ severity: f.severity, description: f.description })), ...(o.flags ?? [])] },
      },
    });
  };

  const prescribe = async (p: P, consult: { id: string } | null, slug: string, pick: number | string, o: { issuedAgo: number; status?: 'ACTIVE' | 'SUPERSEDED' | 'CANCELLED'; prescriber?: { id: string }; supersedesId?: string; refills?: number; cancelReason?: string } ) => {
    const { product, strength } = strengthOf(slug, pick);
    const rx = await prisma.prescription.create({
      data: {
        consultationId: consult?.id ?? null, patientId: p.id, prescriberId: (o.prescriber ?? baseDoctor).id, status: o.status ?? 'ACTIVE', supersedesId: o.supersedesId,
        medication: `${product.brandName ?? product.name} ${strength.label}`, dosage: strength.label, instructions: (product.defaultDirections ?? 'Use as directed by your doctor.'), issuedAt: daysAgo(o.issuedAgo), validUntil: inDays(60 - o.issuedAgo), refillsAllowed: o.refills ?? 0,
        ...(o.status === 'CANCELLED' ? { cancelledAt: daysAgo(o.issuedAgo - 5), cancelReason: o.cancelReason ?? 'Stopped by the doctor' } : {}),
        items: { create: { productId: product.id, strengthId: strength.id, quantity: strength.defaultQuantity ?? 1, directions: (product.defaultDirections ?? 'Use as directed by your doctor.') } },
      },
      include: { items: true },
    });
    return rx;
  };

  const track = (orderId: string, rows: Array<[string, number, string?, string?]>) =>
    prisma.orderTrackingEvent.createMany({ data: rows.map(([status, ago, location, note]) => ({ orderId, status, occurredAt: hoursAgo(ago), location: location ?? null, note: note ?? null, source: 'COURIER', externalId: `show-${orderId}-${status}` })) });

  const order = async (p: P, rxId: string, seq: number, status: 'PENDING' | 'DISPATCHED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED', ago: number, o: { problem?: boolean; reason?: string } = {}) => {
    const dispatched = status === 'PENDING' || status === 'CANCELLED' ? null : daysAgo(ago);
    const created = await prisma.order.create({
      data: {
        prescriptionId: rxId, patientId: p.id, sequence: seq, status, pharmacyRef: status === 'PENDING' ? null : `SHOW-PH-${rxId.slice(-5).toUpperCase()}`, shippingAddress: { line1: p.addressLine1, city: p.city, postcode: p.postcode, country: p.country },
        dispatchedAt: dispatched, carrier: dispatched ? 'DHL Express' : null, trackingNumber: dispatched ? `JD01460000${rxId.slice(-6).toUpperCase()}` : null, trackingUrl: dispatched ? 'https://example.com/track' : null,
        estimatedDeliveryFrom: dispatched ? new Date(dispatched.getTime() + 2 * DAY) : null, estimatedDeliveryTo: dispatched ? new Date(dispatched.getTime() + 3 * DAY) : null,
        outForDeliveryAt: status === 'OUT_FOR_DELIVERY' || status === 'DELIVERED' ? hoursAgo(Math.max(ago * 24 - 60, 4)) : null, deliveredAt: status === 'DELIVERED' ? daysAgo(Math.max(ago - 3, 0)) : null,
        cancelledAt: status === 'CANCELLED' ? daysAgo(ago) : null, cancelReason: status === 'CANCELLED' ? (o.reason ?? 'Patient asked to cancel before it shipped') : null, createdAt: daysAgo(ago + 1),
      },
    });
    if (status === 'DISPATCHED' && !o.problem) await track(created.id, [['LABEL_CREATED', ago * 24 + 6, 'Prishtinë'], ['IN_TRANSIT', ago * 24 - 2, 'Skopje hub']]);
    if (status === 'OUT_FOR_DELIVERY') await track(created.id, [['LABEL_CREATED', ago * 24 + 30, 'Prishtinë'], ['IN_TRANSIT', ago * 24 + 10, 'Skopje hub'], ['OUT_FOR_DELIVERY', 3, 'Local depot']]);
    if (status === 'DELIVERED') await track(created.id, [['LABEL_CREATED', ago * 24 + 30], ['IN_TRANSIT', ago * 24 + 10], ['OUT_FOR_DELIVERY', Math.max(ago - 3, 0) * 24 + 4], ['DELIVERED', Math.max(ago - 3, 0) * 24 + 1, 'Front door']]);
    if (o.problem) await track(created.id, [['LABEL_CREATED', ago * 24 + 30], ['IN_TRANSIT', ago * 24 + 12], ['DELIVERY_FAILED', 20, 'Local depot', 'Nobody home, left a card']]);
    return created;
  };

  const doses = async (p: P, itemId: string, weeks: number, pattern: string, o: { startAgo?: number } = {}) => {
    const rows: Prisma.DoseEventUncheckedCreateInput[] = [];
    const sites = ['ABDOMEN_LEFT', 'ABDOMEN_RIGHT', 'THIGH_LEFT', 'THIGH_RIGHT'] as const;
    for (let w = 0; w < weeks; w += 1) {
      const when = new Date(Date.now() - ((o.startAgo ?? weeks * 7) - w * 7) * DAY);
      const c = pattern[w % pattern.length];
      rows.push({
        prescriptionItemId: itemId, patientId: p.id, scheduledFor: when, status: c === 'T' ? 'TAKEN' : c === 'M' ? 'MISSED' : c === 'S' ? 'SKIPPED' : 'SCHEDULED',
        takenAt: c === 'T' ? new Date(when.getTime() + 2 * HOUR) : null, injectionSite: c === 'T' ? sites[w % 4] : null, feelingAfter: c === 'T' ? (w % 3 === 0 ? 'GREAT' : w % 3 === 1 ? 'GOOD' : 'OKAY') : null,
      });
    }
    rows.push({ prescriptionItemId: itemId, patientId: p.id, scheduledFor: inDays(2), status: 'SCHEDULED' });
    await prisma.doseEvent.createMany({ data: rows, skipDuplicates: true });
  };

  const weightJourney = async (p: P, start: number, target: number, days: number, lossPerDay: number) => {
    await prisma.weightGoal.create({ data: { patientId: p.id, startingWeightKg: start, targetWeightKg: target } });
    const rows: Prisma.WeightEntryUncheckedCreateInput[] = [];
    for (let d = days; d >= 0; d -= 3) {
      const w = start - (days - d) * lossPerDay + (rnd() - 0.5) * 0.8;
      rows.push({ patientId: p.id, weightKg: Math.round(w * 10) / 10, measuredAt: daysAgo(d), source: d % 9 === 0 ? 'DEVICE' : 'PATIENT', clientRequestId: `showcase-${days - d}` });
    }
    // Weight entries are append-only: the request id makes a re-run skip the ones already there.
    await prisma.weightEntry.createMany({ data: rows, skipDuplicates: true });
    for (const d of [days, Math.floor(days / 2), 2]) {
      await prisma.bodyMeasurement.create({ data: { patientId: p.id, measuredAt: daysAgo(d), waistCm: 110 - (days - d) * 0.1, hipsCm: 120 - (days - d) * 0.08, armCm: 38 - (days - d) * 0.02 } });
    }
  };

  const sideEffects = async (p: P, level: 'calm' | 'rough') => {
    // Each symptom is scored 1 (none) to 10 (worst).
    const num = (max: number) => 1 + Math.min(Math.round(rnd() * max), 9);
    for (let w = 6; w >= 0; w -= 1) {
      const m = level === 'rough' ? 7 : 2;
      await prisma.sideEffectLog.create({ data: { patientId: p.id, recordedAt: daysAgo(w * 5), nausea: num(m + 1), vomiting: num(m), abdominalPain: num(m), diarrhoea: num(m), constipation: num(m), fatigue: num(m + 1), note: w === 2 ? 'Worse the day after the injection.' : null } });
    }
  };

  const symptoms = async (p: P, scale: 'MRS' | 'AMS', months: number[]) => {
    const def = SCALES[scale];
    const lo = def.options[0].score;
    const hi = def.options[def.options.length - 1].score;
    for (const [i, level] of months.entries()) {
      const answers = def.items.map((item) => ({ itemId: item.id, score: Math.max(lo, Math.min(hi, Math.round(lo + (hi - lo) * level + (rnd() - 0.5) * 1.4))) }));
      void scaleDomains;
      await prisma.symptomAssessment.create({ data: { patientId: p.id, scale, answers, totalScore: answers.reduce((s, a) => s + a.score, 0), recordedAt: daysAgo((months.length - 1 - i) * 30 + 3) } });
    }
  };

  const labs = (p: P, rows: Array<{ kind: any; value: number; unit: string; low?: number; high?: number; ago: number; name?: string; reviewed?: boolean; note?: string }>) =>
    prisma.labResult.createMany({
      data: rows.map((r) => ({
        patientId: p.id, kind: r.kind, analyteName: r.name ?? null, value: r.value, unit: r.unit, referenceRangeLow: r.low ?? null, referenceRangeHigh: r.high ?? null,
        flagged: (r.low != null && r.value < r.low) || (r.high != null && r.value > r.high), collectedAt: daysAgo(r.ago), enteredById: baseDoctor.id, note: r.note ?? null,
        ...(r.reviewed ? { reviewedAt: daysAgo(r.ago - 2), reviewedById: baseDoctor.id, reviewNote: 'Reviewed, nothing to act on.' } : {}),
      })),
    });

  const checkIn = (p: P, kind: Kind, status: 'SCHEDULED' | 'SENT' | 'COMPLETED', o: { rxId?: string; dueAgo: number; outcome?: 'REPEAT' | 'NEW_PRESCRIPTION' | 'HOLD' | 'STOP'; reviewed?: boolean; pick?: Record<string, string>; weight?: number; feeling?: 'GREAT' | 'GOOD' | 'OKAY' | 'DIFFICULTIES' | 'NOT_WELL'; note?: string; patientNote?: string }) => {
    const a = status === 'COMPLETED' ? answersFor(kind, 'CHECKIN', o.pick) : null;
    return prisma.checkIn.create({
      data: {
        patientId: p.id, kind, dueAt: o.dueAgo >= 0 ? daysAgo(o.dueAgo) : inDays(-o.dueAgo), status, prescriptionId: o.rxId ?? null,
        ...(status !== 'SCHEDULED' ? { sentAt: daysAgo(o.dueAgo + 1), token: crypto.randomBytes(16).toString('hex'), tokenExpiresAt: inDays(5) } : {}),
        ...(a ? { answers: a.answers as any, redFlags: a.flags as any, questionnaireVersion: a.version, wantsToReorder: true, weightKg: o.weight ?? null, feeling: o.feeling ?? 'GOOD', completedAt: daysAgo(o.dueAgo - 1), patientNote: o.patientNote ?? null } : {}),
        ...(o.reviewed ? { reviewedAt: daysAgo(o.dueAgo - 2), reviewedById: baseDoctor.id, outcome: o.outcome ?? 'REPEAT', reviewNote: o.note ?? 'Doing well, continue.' } : {}),
      },
    });
  };

  const say = (p: P, consultId: string | null, from: 'patient' | { id: string; role?: string }, content: string, hours: number, read = true) =>
    prisma.message.create({
      data: { patientId: p.id, consultationId: consultId, senderId: from === 'patient' ? p.id : from.id, senderRole: from === 'patient' ? 'PATIENT' : 'CLINICIAN', content, sentAt: hoursAgo(hours), readAt: read ? hoursAgo(hours - 1) : null },
    });

  // ═══ PATIENTS ═══════════════════════════════════════════════════════════════════════════════════════════════════
  const cast: Record<string, P> = {};

  // 1 · Just paid, hasn't set a password yet: "activation pending", the Quick fix "Resend activation link" applies
  cast.pending = await patient({ key: 'arta.pending', first: 'Arta', last: 'Pending', gender: 'FEMALE', born: 1985, createdAgo: 1, activatedAgo: null });
  cast.pending2 = await patient({ key: 'bekim.pending', first: 'Bekim', last: 'Waiting', gender: 'MALE', born: 1979, createdAgo: 4, activatedAgo: null });

  // 2 · Onboarding in each state
  cast.onbProgress = await patient({ key: 'liridona.onboarding', first: 'Liridona', last: 'Started', gender: 'FEMALE', born: 1990, createdAgo: 3 });
  await onboarding(cast.onbProgress, 'IN_PROGRESS', 3);
  await consentFor(cast.onbProgress, 3);
  await say(cast.onbProgress, null, 'patient', 'Hello, the photo upload keeps spinning and never finishes. I am on an iPhone.', 20, false);
  await say(cast.onbProgress, null, 'patient', 'I tried three times. Is the app broken?', 19, false);

  cast.onbReview = await patient({ key: 'gentian.review', first: 'Gentian', last: 'Submitted', gender: 'MALE', born: 1982, createdAgo: 4, height: 181 });
  await onboarding(cast.onbReview, 'PENDING_REVIEW', 2);
  await consentFor(cast.onbReview, 4);
  await consultation(cast.onbReview, 'GLP1', 'SUBMITTED', 2, { pick: { weight_kg: '124', height_cm: '181' } });

  cast.onbRejected = await patient({ key: 'drita.redo', first: 'Drita', last: 'SentBack', gender: 'FEMALE', born: 1988, createdAgo: 6, height: 165 });
  await onboarding(cast.onbRejected, 'REJECTED', 4, { stepFeedback: [{ step: 'BODY_PHOTO', approved: false, reason: 'The side photo is blurred. Please retake it in good light.', files: [] }] as any });
  await consentFor(cast.onbRejected, 6);
  const drCon = await consultation(cast.onbRejected, 'GLP1', 'MORE_INFO_REQUESTED', 4, { pick: { weight_kg: '104', height_cm: '165' } });
  await say(cast.onbRejected, drCon.id, baseDoctor, 'Hello Drita, the side photo is blurred. Could you retake it in good light and send it again?', 70, true);
  await say(cast.onbRejected, drCon.id, 'patient', 'Sure, I will do it this evening. Thank you!', 60, false);

  cast.onbDeclined = await patient({ key: 'ilir.declined', first: 'Ilir', last: 'Declined', gender: 'MALE', born: 1970, createdAgo: 12, height: 175 });
  await onboarding(cast.onbDeclined, 'DECLINED', 9);
  await consentFor(cast.onbDeclined, 12);
  await consultation(cast.onbDeclined, 'TRT', 'DECLINED', 9, { declineReason: 'Identity documents did not match the details given.', refundStatus: 'REFUNDED' });

  // 3 · Consultations waiting for a doctor, in each state, with red flags
  const waiting: Array<[string, string, string, Kind, 'SUBMITTED' | 'IN_REVIEW' | 'MORE_INFO_REQUESTED', number, Record<string, string>, ({ id: string } | null)?]> = [
    ['rrezarta.new', 'Rrezarta', 'NewConsult', 'HRT', 'SUBMITTED', 1, {}],
    ['valon.new', 'Valon', 'NewGlp1', 'GLP1', 'SUBMITTED', 1, { weight_kg: '131', height_cm: '178' }],
    ['teuta.review', 'Teuta', 'InReview', 'HRT', 'IN_REVIEW', 3, {}, doctor2],
    ['ardit.review', 'Ardit', 'InReviewTrt', 'TRT', 'IN_REVIEW', 5, {}],
    ['mimoza.info', 'Mimoza', 'MoreInfo', 'GLP1', 'MORE_INFO_REQUESTED', 6, { weight_kg: '97', height_cm: '163' }],
  ];
  for (const [key, first, last, kind, status, ago, pick, clin] of waiting) {
    const p = await patient({ key, first, last, gender: kind === 'TRT' || key.startsWith('valon') ? 'MALE' : 'FEMALE', born: 1975 + (ago % 15), createdAgo: ago + 3, height: pick.height_cm ? Number(pick.height_cm) : undefined });
    await onboarding(p, 'APPROVED', ago + 2);
    await consentFor(p, ago + 3);
    const c = await consultation(p, kind, status, ago, { clinician: clin ?? baseDoctor, pick, flags: status === 'IN_REVIEW' ? [{ severity: 'WARNING', description: 'History of migraine with aura: check before oestrogen' }] : undefined });
    cast[key] = p;
    if (status === 'MORE_INFO_REQUESTED') {
      await say(p, c.id, baseDoctor, 'Could you tell us which medicines you take for your thyroid, and the dose?', 40, true);
      await say(p, c.id, 'patient', 'Levothyroxine 75 micrograms every morning.', 30, false);
    }
  }
  // A consultation with a critical flag and an urgent message
  cast.critical = await patient({ key: 'shpend.flag', first: 'Shpend', last: 'Flagged', gender: 'MALE', born: 1968, createdAgo: 4, height: 172 });
  await onboarding(cast.critical, 'APPROVED', 3);
  await consentFor(cast.critical, 4);
  const critCon = await consultation(cast.critical, 'GLP1', 'SUBMITTED', 2, { pick: { weight_kg: '140', height_cm: '172' }, flags: [{ severity: 'CRITICAL', description: 'Personal history of pancreatitis' }, { severity: 'WARNING', description: 'BMI above 45: needs a doctor’s review of the dose plan' }] });
  await prisma.message.create({ data: { patientId: cast.critical.id, consultationId: critCon.id, senderId: cast.critical.id, senderRole: 'PATIENT', content: 'I have had bad stomach pain going to my back since last night. Is it safe to start the medicine?', sentAt: hoursAgo(3), aiUrgent: true, aiUrgentReason: 'stomach pain spreading to the back', aiCheckedAt: hoursAgo(3) } });

  // 4 · A declined consultation, one refunded and one where the automatic refund failed (a manual job)
  cast.declinedRefunded = await patient({ key: 'vjosa.declined', first: 'Vjosa', last: 'Declined', gender: 'FEMALE', born: 1993, createdAgo: 20 });
  await onboarding(cast.declinedRefunded, 'APPROVED', 18);
  await consultation(cast.declinedRefunded, 'HRT', 'DECLINED', 16, { declineReason: 'Not suitable: current breast cancer treatment.', refundStatus: 'REFUNDED' });
  cast.declinedFailed = await patient({ key: 'korab.refundfail', first: 'Korab', last: 'RefundFailed', gender: 'MALE', born: 1966, createdAgo: 14 });
  await onboarding(cast.declinedFailed, 'APPROVED', 12);
  await consultation(cast.declinedFailed, 'TRT', 'DECLINED', 10, { declineReason: 'Not suitable: untreated sleep apnoea.', refundStatus: 'FAILED' });
  await prisma.message.create({ data: { patientId: cast.declinedFailed.id, consultationId: null, senderId: cast.declinedFailed.id, senderRole: 'PATIENT', content: 'You declined me but I have not seen my money back yet. Can you tell me when?', sentAt: hoursAgo(26), readAt: null } });

  // 5 · Active GLP-1 patients, each in a different place on the road
  const glp1Stories = [
    { key: 'sofije.titrating', first: 'Sofije', last: 'Titrating', slug: 'semaglutide-wegovy', step: 2, weeks: 10, pattern: 'TTTTTTTTMT', start: 112, target: 85, orderStatus: 'DELIVERED' as const, se: 'calm' as const },
    { key: 'dardan.rough', first: 'Dardan', last: 'RoughWeeks', slug: 'tirzepatide-mounjaro', step: 1, weeks: 8, pattern: 'TTSTMMTT', start: 128, target: 100, orderStatus: 'OUT_FOR_DELIVERY' as const, se: 'rough' as const },
    { key: 'flutura.onway', first: 'Flutura', last: 'OnTheWay', slug: 'semaglutide-wegovy', step: 0, weeks: 3, pattern: 'TTT', start: 99, target: 78, orderStatus: 'DISPATCHED' as const, se: 'calm' as const },
    { key: 'agim.waiting', first: 'Agim', last: 'WaitingPharmacy', slug: 'semaglutide-ozempic', step: 0, weeks: 1, pattern: 'T', start: 121, target: 96, orderStatus: 'PENDING' as const, se: 'calm' as const },
    { key: 'ramize.problem', first: 'Ramize', last: 'ParcelProblem', slug: 'tirzepatide-mounjaro', step: 2, weeks: 12, pattern: 'TTTTTTTTTTTT', start: 109, target: 80, orderStatus: 'DISPATCHED' as const, se: 'calm' as const, problem: true },
  ];
  for (const [i, s] of glp1Stories.entries()) {
    const p = await patient({ key: s.key, first: s.first, last: s.last, gender: i % 2 ? 'MALE' : 'FEMALE', born: 1978 + i * 3, createdAgo: s.weeks * 7 + 6, height: 168 + i * 3, city: ['Prishtinë', 'Prizren', 'Pejë', 'Gjakovë', 'Ferizaj'][i] });
    await onboarding(p, 'APPROVED', s.weeks * 7 + 4);
    await consentFor(p, s.weeks * 7 + 6);
    const c = await consultation(p, 'GLP1', 'APPROVED', s.weeks * 7 + 3, { clinician: doctors[i % 2], pick: { weight_kg: String(Math.round(s.start)), height_cm: String(168 + i * 3) } });
    const rx = await prescribe(p, c, s.slug, s.step, { issuedAgo: s.weeks * 7, prescriber: doctors[i % 2] });
    await order(p, rx.id, 1, s.orderStatus === 'PENDING' ? 'PENDING' : s.orderStatus, s.orderStatus === 'PENDING' ? 1 : s.problem ? 5 : 3, { problem: (s as any).problem });
    await doses(p, rx.items[0].id, s.weeks, s.pattern);
    await weightJourney(p, s.start, s.target, s.weeks * 7, 0.22);
    await sideEffects(p, s.se);
    await checkIn(p, 'GLP1', 'COMPLETED', { rxId: rx.id, dueAgo: 20, reviewed: true, pick: { weight_kg: String(Math.round(s.start - 4)) }, weight: s.start - 4, outcome: 'REPEAT', note: 'Losing steadily. Continue.' });
    await checkIn(p, 'GLP1', i % 2 ? 'COMPLETED' : 'SENT', { rxId: rx.id, dueAgo: 2, pick: { weight_kg: String(Math.round(s.start - 8)) }, weight: s.start - 8, feeling: i % 2 ? 'OKAY' : undefined });
    await checkIn(p, 'GLP1', 'SCHEDULED', { rxId: rx.id, dueAgo: -12 });
    cast[s.key] = p;
  }
  // The "waiting for you" and "flagged" ones: side-effect reports in each severity, acknowledged and not
  const roughOne = cast['dardan.rough'];
  await prisma.sideEffectReport.createMany({
    data: [
      { patientId: roughOne.id, effects: ['nausea', 'fatigue'], severity: 'MILD', note: 'Tired after the injection.', medication: 'Mounjaro 2.5 mg', createdAt: daysAgo(14), acknowledgedAt: daysAgo(13), acknowledgedById: baseDoctor.id },
      { patientId: roughOne.id, effects: ['vomiting', 'abdominal pain'], severity: 'MODERATE', note: 'Vomited twice yesterday.', medication: 'Mounjaro 2.5 mg', createdAt: daysAgo(3) },
      { patientId: cast['sofije.titrating'].id, effects: ['severe vomiting', 'cannot keep fluids down'], severity: 'SEVERE', note: 'Since last night.', medication: 'Wegovy 0.5 mg', createdAt: hoursAgo(5) },
    ],
  });
  await say(cast['ramize.problem'], null, 'patient', 'Hello, DHL left a card but I was at work. Where can I collect my parcel? It is my medicine.', 22, false);
  await say(cast['ramize.problem'], null, cx2, 'Hi Ramize, I am checking with the courier now and will come back to you shortly.', 20, true);
  await say(cast['flutura.onway'], null, 'patient', 'Hi, can I change the delivery address? I will be at my sister’s in Prizren on Friday.', 8, false);
  await say(cast['agim.waiting'], null, 'patient', 'My payment page said my card was declined but the money left my account. What should I do?', 5, false);

  // 6 · HRT patients with symptom trends and chains of prescriptions
  const hrtStories = [
    { key: 'emine.improving', first: 'Emine', last: 'Improving', born: 1973, months: [0.8, 0.65, 0.5, 0.35, 0.22] },
    { key: 'mirlinda.stuck', first: 'Mirlinda', last: 'NotBetter', born: 1969, months: [0.7, 0.72, 0.68, 0.74] },
    { key: 'lule.new', first: 'Lule', last: 'FirstMonth', born: 1977, months: [0.75] },
  ];
  for (const [i, s] of hrtStories.entries()) {
    const p = await patient({ key: s.key, first: s.first, last: s.last, gender: 'FEMALE', born: s.born, createdAgo: s.months.length * 30 + 10, height: 162 });
    await onboarding(p, 'APPROVED', s.months.length * 30 + 8);
    await consentFor(p, s.months.length * 30 + 10);
    const c = await consultation(p, 'HRT', 'APPROVED', s.months.length * 30 + 6, { clinician: doctors[i % 2] });
    const a = await prescribe(p, c, 'estradiol-patch-evorel', '100', { issuedAgo: s.months.length * 30, status: s.months.length > 2 ? 'SUPERSEDED' : 'ACTIVE', prescriber: doctors[i % 2] });
    const b = s.months.length > 2 ? await prescribe(p, null, 'estradiol-patch-evorel', '75', { issuedAgo: 30, supersedesId: a.id, prescriber: doctors[i % 2] }) : a;
    await prescribe(p, null, 'progesterone-utrogestan', '100', { issuedAgo: 28, prescriber: doctors[i % 2] });
    await order(p, a.id, 1, 'DELIVERED', s.months.length * 30 - 2);
    if (b !== a) await order(p, b.id, 1, i === 1 ? 'DISPATCHED' : 'DELIVERED', i === 1 ? 2 : 26);
    await symptoms(p, 'MRS', s.months);
    await checkIn(p, 'HRT', 'COMPLETED', { rxId: b.id, dueAgo: 15, reviewed: i !== 1, outcome: 'NEW_PRESCRIPTION', note: 'Symptoms improving.', pick: { symptom_control: i === 1 ? 'same' : 'better' }, feeling: i === 1 ? 'DIFFICULTIES' : 'GOOD' });
    await checkIn(p, 'HRT', 'SCHEDULED', { rxId: b.id, dueAgo: -15 });
    await labs(p, [
      { kind: 'ESTRADIOL', value: 55, unit: 'pmol/L', low: 100, high: 700, ago: s.months.length * 30, reviewed: true },
      { kind: 'ESTRADIOL', value: i === 1 ? 90 : 380, unit: 'pmol/L', low: 100, high: 700, ago: 20, reviewed: i === 0 },
      { kind: 'FSH', value: 78, unit: 'IU/L', low: 25.8, high: 134.8, ago: s.months.length * 30, reviewed: true },
    ]);
    cast[s.key] = p;
  }
  await say(cast['mirlinda.stuck'], null, 'patient', 'I do not feel any better after two months. Hot flushes are as bad as before. Should I change the patch?', 12, false);
  await say(cast['emine.improving'], null, 'patient', 'Thank you doctor, I sleep much better now!', 70, true);

  // 7 · TRT patients, with monitoring labs ok, overdue and out of range
  const trtStories = [
    { key: 'fatmir.labsok', first: 'Fatmir', last: 'LabsFine', born: 1971, hct: 47, psa: 1.1, overdue: false },
    { key: 'burim.hematocrit', first: 'Burim', last: 'HighHct', born: 1964, hct: 54, psa: 2.9, overdue: false },
    { key: 'naser.overdue', first: 'Naser', last: 'BloodsOverdue', born: 1975, hct: 46, psa: 0.9, overdue: true },
  ];
  for (const [i, s] of trtStories.entries()) {
    const p = await patient({ key: s.key, first: s.first, last: s.last, gender: 'MALE', born: s.born, createdAgo: 160, height: 179 });
    await onboarding(p, 'APPROVED', 158);
    await consentFor(p, 160);
    const c = await consultation(p, 'TRT', 'APPROVED', 156, { clinician: doctors[i % 2] });
    const rx = await prescribe(p, c, i === 2 ? 'testosterone-injection-sustanon' : 'testosterone-gel-tostran', 0, { issuedAgo: 150, prescriber: doctors[i % 2], refills: 5 });
    await order(p, rx.id, 1, 'DELIVERED', 140);
    await order(p, rx.id, 2, 'DELIVERED', 90);
    await order(p, rx.id, 3, 'DELIVERED', 30);
    await symptoms(p, 'AMS', [0.7, 0.55, 0.4, 0.3]);
    await labs(p, [
      { kind: 'TESTOSTERONE', value: 8.1, unit: 'nmol/L', low: 8.6, high: 29, ago: 150, reviewed: true, note: 'Baseline' },
      ...(s.overdue ? [] : [
        { kind: 'TESTOSTERONE', value: 17.5, unit: 'nmol/L', low: 8.6, high: 29, ago: 60, reviewed: true },
        { kind: 'HEMATOCRIT', value: s.hct, unit: '%', low: 38, high: 50, ago: 14, reviewed: s.hct <= 50 },
        { kind: 'PSA', value: s.psa, unit: 'ng/mL', low: 0, high: 4, ago: 14, reviewed: true },
        { kind: 'LIPID_PANEL', value: 5.4, unit: 'mmol/L', low: 0, high: 5.2, ago: 14 },
      ]),
    ]);
    await checkIn(p, 'TRT', 'COMPLETED', { rxId: rx.id, dueAgo: 25, reviewed: true, outcome: 'REPEAT', pick: {} });
    cast[s.key] = p;
  }

  // 8 · Ended and unhappy: subscription finished, refund requests in each state
  cast.ended = await patient({ key: 'albina.ended', first: 'Albina', last: 'Ended', gender: 'FEMALE', born: 1981, createdAgo: 120, extra: { subscriptionEndedAt: daysAgo(15) } });
  await onboarding(cast.ended, 'APPROVED', 118);
  const endCon = await consultation(cast.ended, 'HRT', 'APPROVED', 116);
  const endRx = await prescribe(cast.ended, endCon, 'estradiol-gel-oestrogel', 0, { issuedAgo: 110, status: 'CANCELLED', cancelReason: 'Patient ended the subscription' });
  await order(cast.ended, endRx.id, 1, 'DELIVERED', 105);
  await order(cast.ended, endRx.id, 2, 'CANCELLED', 40, { reason: 'Subscription ended before it shipped' });
  const refunds: Array<[P, string, number, string | null, string | null]> = [
    [cast.pending2, 'REQUESTED', 1, null, null],
    [cast['agim.waiting'], 'REQUESTED', 2, null, null],
    [cast.ended, 'APPROVED', 18, 'Refunded £84.00 and cancelled the subscription', baseAdmin.id],
    [cast.declinedRefunded, 'DECLINED', 25, 'Declined', baseAdmin.id],
  ];
  for (const [p, status, ago, outcome, by] of refunds) {
    await prisma.refundRequest.create({ data: { patientId: p.id, status, requestedAt: daysAgo(ago), ...(by ? { decidedAt: daysAgo(ago - 1), decidedById: by, outcome } : {}) } });
  }

  // 9 · Appointments: urgent, routine, completed, cancelled, plus bookings
  const appt = (p: P, o: Omit<Prisma.AppointmentRequestUncheckedCreateInput, 'patientId' | 'respondBy'> & { ago: number }) =>
    prisma.appointmentRequest.create({ data: { patientId: p.id, respondBy: o.urgency === 'URGENT' ? hoursAgo(-24 + o.ago * 24) : inDays(3 - o.ago), createdAt: daysAgo(o.ago), ...(({ ago, ...rest }) => rest)(o) } });
  await appt(cast['dardan.rough'], { ago: 0.3, reason: 'SIDE_EFFECT', details: 'Vomiting since yesterday and dizzy. I need advice before my next injection.', urgency: 'URGENT', redFlags: ['persistent_vomiting'], emergencyAdvised: false, status: 'REQUESTED' });
  await appt(cast['sofije.titrating'], { ago: 0.2, reason: 'PAIN', details: 'Strong pain in my upper stomach that spreads to my back.', painLevel: 8, urgency: 'URGENT', redFlags: ['severe_abdominal_pain'], emergencyAdvised: true, status: 'REQUESTED' });
  await appt(cast['mirlinda.stuck'], { ago: 2, reason: 'DOSE_CHANGE', details: 'My hot flushes are not improving, can we talk about a higher dose?', urgency: 'ROUTINE', redFlags: [], preferredTimes: 'Weekday afternoons', status: 'SCHEDULED', scheduledFor: inDays(2), meetingUrl: 'https://meet.example.com/showcase-1', handledById: doctor2.id, clinicianNote: 'Booked for Thursday.' });
  await appt(cast['emine.improving'], { ago: 20, reason: 'CHECK_UP', details: 'Routine three-month check.', urgency: 'ROUTINE', redFlags: [], status: 'COMPLETED', scheduledFor: daysAgo(15), handledById: baseDoctor.id });
  await appt(cast['fatmir.labsok'], { ago: 9, reason: 'QUESTION', details: 'Can I take my gel in the evening instead?', urgency: 'ROUTINE', redFlags: [], status: 'CANCELLED', cancelledAt: daysAgo(8) });
  const booking = (p: P, uid: string, purpose: string, startsIn: number, status: 'CONFIRMED' | 'PENDING' | 'RESCHEDULED' | 'CANCELLED' | 'COMPLETED', who: { id: string; firstName: string; lastName: string; email: string }) =>
    prisma.booking.create({ data: { providerUid: `showcase-${uid}`, purpose, patientId: p.id, clinicianId: who.id, hostName: `${who.firstName} ${who.lastName}`, hostEmail: who.email, attendeeName: `${p.firstName} ${p.lastName}`, attendeeEmail: p.email, title: purpose === 'CONSULTATION' ? 'Video consultation' : 'Follow-up call', status, startsAt: new Date(Date.now() + startsIn * DAY), endsAt: new Date(Date.now() + startsIn * DAY + 20 * 60_000), meetingUrl: 'https://meet.example.com/showcase-room' } });
  await booking(cast['teuta.review'], 'b1', 'CONSULTATION', 1.1, 'CONFIRMED', doctor2);
  await booking(cast['ardit.review'], 'b2', 'CONSULTATION', 3, 'PENDING', baseDoctor);
  await booking(cast['emine.improving'], 'b3', 'FOLLOW_UP', 6, 'RESCHEDULED', doctor2);
  await booking(cast['burim.hematocrit'], 'b4', 'FOLLOW_UP', 0.4, 'CONFIRMED', baseDoctor);
  await booking(cast['naser.overdue'], 'b5', 'FOLLOW_UP', -4, 'COMPLETED', baseDoctor);
  await booking(cast['lule.new'], 'b6', 'CONSULTATION', -2, 'CANCELLED', doctor2);

  // 10 · Referrals and vouchers
  const referrer = cast['emine.improving'];
  const referredLead = await prisma.lead.create({ data: { email: 'showcase.friend.converted@example.com', firstName: 'Nora', lastName: 'Friend', productKind: 'HRT', quizAnswers: eligibility('HRT'), referralCode: referrer.referralCode, convertedAt: daysAgo(12), createdAt: daysAgo(20), intakeAnswers: intake('HRT'), intakeSavedAt: daysAgo(18) } });
  const referredPatient = await patient({ key: 'nora.friend', first: 'Nora', last: 'Friend', gender: 'FEMALE', born: 1980, createdAgo: 12, extra: { leadId: referredLead.id } });
  await onboarding(referredPatient, 'IN_PROGRESS', 11);
  const ref1 = await prisma.referral.create({ data: { code: referrer.referralCode!, referrerId: referrer.id, referredLeadId: referredLead.id, referredPatientId: referredPatient.id, status: 'CONVERTED', convertedAt: daysAgo(12) } });
  await prisma.voucher.create({ data: { patientId: referrer.id, referralId: ref1.id, kind: 'REFERRER_REWARD', amountCents: 2000, currency: 'gbp', status: 'ISSUED', issuedAt: daysAgo(11) } });
  await prisma.voucher.create({ data: { patientId: referredPatient.id, referralId: ref1.id, kind: 'REFEREE_REWARD', amountCents: 2000, currency: 'gbp', status: 'APPLIED', issuedAt: daysAgo(12), appliedAt: daysAgo(12), note: 'Applied automatically at checkout' } });
  const pendingLead = await prisma.lead.create({ data: { email: 'showcase.friend.pending@example.com', firstName: 'Kaltrina', lastName: 'Invited', productKind: 'GLP1', quizAnswers: eligibility('GLP1'), referralCode: referrer.referralCode, createdAt: daysAgo(4) } });
  await prisma.referral.create({ data: { code: referrer.referralCode!, referrerId: referrer.id, referredLeadId: pendingLead.id, status: 'PENDING' } });
  const ref2Lead = await prisma.lead.create({ data: { email: 'showcase.friend.applied@example.com', firstName: 'Leart', lastName: 'Invited', productKind: 'TRT', quizAnswers: eligibility('TRT'), referralCode: cast['fatmir.labsok'].referralCode, convertedAt: daysAgo(40), createdAt: daysAgo(45) } });
  const ref2 = await prisma.referral.create({ data: { code: cast['fatmir.labsok'].referralCode!, referrerId: cast['fatmir.labsok'].id, referredLeadId: ref2Lead.id, status: 'CONVERTED', convertedAt: daysAgo(40) } });
  await prisma.voucher.create({ data: { patientId: cast['fatmir.labsok'].id, referralId: ref2.id, kind: 'REFERRER_REWARD', amountCents: 2000, status: 'APPLIED', issuedAt: daysAgo(39), appliedAt: daysAgo(30), note: 'Applied to the next payment' } });

  // 11 · Leads: a wide spread across the three programmes and every stage
  const leadSpecs: Array<[string, string, string, Kind, Record<string, string>, number, 'quiz' | 'health' | 'checkout' | 'stopped']> = [
    ['hana.quiz', 'Hana', 'QuizOnly', 'HRT', {}, 1, 'quiz'], ['drilon.quiz', 'Drilon', 'QuizOnly', 'GLP1', {}, 2, 'quiz'], ['ermal.quiz', 'Ermal', 'QuizOnly', 'TRT', {}, 3, 'quiz'],
    ['zana.health', 'Zana', 'HealthAnswered', 'HRT', {}, 5, 'health'], ['besnik.health', 'Besnik', 'HealthAnswered', 'GLP1', {}, 7, 'health'], ['uran.health', 'Uran', 'HealthAnswered', 'TRT', {}, 11, 'health'],
    ['kaltrina.checkout', 'Kaltrina', 'AtCheckout', 'GLP1', {}, 3, 'checkout'], ['faton.checkout', 'Faton', 'AtCheckout', 'TRT', {}, 6, 'checkout'], ['rozafa.checkout', 'Rozafa', 'AtCheckout', 'HRT', {}, 2, 'checkout'],
    ['dora.stopped', 'Dora', 'Stopped', 'HRT', {}, 21, 'stopped'], ['lendrit.old', 'Lendrit', 'LongAgo', 'GLP1', {}, 60, 'health'],
    ['anila.ruledout', 'Anila', 'RuledOut', 'HRT', { medical_history: 'breast_cancer' }, 8, 'health'],
  ];
  for (const [key, first, last, kind, pick, ago, stage] of leadSpecs) {
    await prisma.lead.create({
      data: {
        email: `showcase.${key}@example.com`, firstName: first, lastName: last, productKind: kind, quizAnswers: eligibility(kind, pick), createdAt: daysAgo(ago), updatedAt: daysAgo(Math.max(ago - 1, 0)),
        ...(stage !== 'quiz' ? { intakeAnswers: intake(kind), intakeConsentVersion: CURRENT_CONSENTS[ConsentType.TELEHEALTH]?.version ?? '1', intakeSavedAt: daysAgo(ago) } : {}),
        ...(stage === 'checkout' ? { checkoutDetails: { name: `${first} ${last}`, line1: 'Rr. Showcase 9', city: 'Ferizaj', postalCode: '70000', country: 'Kosovo' }, reminderCount: 1, lastReminderAt: daysAgo(1) } : {}),
        ...(stage === 'stopped' ? { reminderCount: 2, lastReminderAt: daysAgo(15), remindersStoppedAt: daysAgo(14) } : {}),
      },
    });
  }
  console.log('✓ Patients, treatments, orders, check-ins, labs, symptoms, appointments, referrals, leads');

  // ═══ MESSAGES: everyday support questions, some unanswered ═════════════════════════════════════════════════════
  const supportQs: Array<[P, string, string | null, number]> = [
    [cast['sofije.titrating'], 'Where can I download the receipt for my last payment? My employer asks for it.', 'You can find every payment under Settings → Billing → Invoices. Tell me if you cannot see it and I will send it to you.', 50],
    [cast['valon.new'], 'Hello, how long until the doctor looks at my questionnaire?', null, 6],
    [cast['lule.new'], 'Hi! Is there an app for my phone or only the website?', 'Hi Lule! There is an app for iPhone and Android. Search for our name in the store and sign in with the same email.', 30],
    [cast['burim.hematocrit'], 'My gel pump is not delivering any gel. Can I get a replacement?', null, 4],
    [cast['teuta.review'], 'I forgot my password and the email with the reset link never came.', 'I have sent you a new reset link. Please check your spam folder too.', 18],
    [cast.ended, 'How do I get my data deleted from your system?', null, 90],
  ];
  for (const [p, q, a, h] of supportQs) {
    const thread = await prisma.consultation.findFirst({ where: { patientId: p.id }, orderBy: { submittedAt: 'desc' }, select: { id: true } });
    await say(p, thread?.id ?? null, 'patient', q, h, a !== null);
    if (a) await say(p, thread?.id ?? null, cx2, a, h - 2, true);
  }

  // ═══ TICKETS: tied to the patients above, in every state and type ═══════════════════════════════════════════════
  const ticketSpecs: Array<{ p?: P; subject: string; type: any; status: any; priority: any; ago: number; assignee?: { id: string }; notes?: string[]; description: string }> = [
    { p: cast.onbProgress, subject: 'Photo upload spins forever on iPhone', type: 'TECHNICAL', status: 'OPEN', priority: 'HIGH', ago: 18, description: 'Three tries, iPhone 13, iOS 18.' },
    { p: cast['ramize.problem'], subject: 'Parcel not delivered, patient at work', type: 'DELIVERY', status: 'IN_PROGRESS', priority: 'URGENT', ago: 21, assignee: cx2, description: 'DHL left a card. It is her medicine.', notes: ['Called DHL, they will redeliver tomorrow morning.', 'Told the patient. She will be home.'] },
    { p: cast['flutura.onway'], subject: 'Wants to change delivery address before it arrives', type: 'DELIVERY', status: 'OPEN', priority: 'NORMAL', ago: 7, description: 'New address in Prizren, for Friday.' },
    { p: cast['agim.waiting'], subject: 'Card declined but money left the account', type: 'BILLING', status: 'IN_PROGRESS', priority: 'HIGH', ago: 4, assignee: baseCx, description: 'Payment page said declined; bank shows a hold.', notes: ['Stripe shows a failed attempt and an authorisation that will drop off in 3 to 5 days. Explained to the patient.'] },
    { p: cast.pending, subject: 'Never received the activation email', type: 'ACCOUNT', status: 'OPEN', priority: 'URGENT', ago: 3, description: 'Paid an hour ago, nothing in spam either.' },
    { p: cast.pending2, subject: 'Asked for a refund before setting up', type: 'BILLING', status: 'WAITING_ON_PATIENT', priority: 'NORMAL', ago: 30, assignee: baseCx, description: 'Changed his mind.', notes: ['Asked him to confirm by reply. A refund request is open for an admin.'] },
    { p: cast['sofije.titrating'], subject: 'Severe vomiting since last night', type: 'CLINICAL', status: 'OPEN', priority: 'URGENT', ago: 4, assignee: baseDoctor, description: 'Reported a severe side effect, cannot keep fluids down.', notes: ['Handed to the doctors: not for support to answer.'] },
    { p: cast['mirlinda.stuck'], subject: 'Wants a higher dose, symptoms not improving', type: 'CLINICAL', status: 'IN_PROGRESS', priority: 'HIGH', ago: 11, assignee: doctor2, description: 'Two months in, no change.', notes: ['Appointment booked for Thursday.'] },
    { p: cast['burim.hematocrit'], subject: 'Gel pump not working, needs a replacement', type: 'DELIVERY', status: 'OPEN', priority: 'NORMAL', ago: 3, description: 'No gel comes out of the pump.' },
    { p: cast['teuta.review'], subject: 'Password reset email never arrived', type: 'ACCOUNT', status: 'RESOLVED', priority: 'NORMAL', ago: 60, assignee: cx2, description: 'Sent a fresh link.', notes: ['Resent the link; patient signed in.'] },
    { p: cast['sofije.titrating'], subject: 'Needs a receipt for her employer', type: 'BILLING', status: 'RESOLVED', priority: 'LOW', ago: 52, assignee: baseCx, description: 'Wants the last three invoices.', notes: ['Showed her where invoices are.'] },
    { p: cast['lule.new'], subject: 'Is there a phone app?', type: 'OTHER', status: 'CLOSED', priority: 'LOW', ago: 32, assignee: cx2, description: 'Asked in messages.' },
    { p: cast.ended, subject: 'Data deletion request', type: 'ACCOUNT', status: 'WAITING_ON_PATIENT', priority: 'HIGH', ago: 90, assignee: baseAdmin, description: 'Wants her data erased. Needs identity confirmation before we act.', notes: ['Asked her to confirm by email from the address on file.'] },
    { p: cast['dardan.rough'], subject: 'Weight not showing in the app after the smart scale sync', type: 'TECHNICAL', status: 'IN_PROGRESS', priority: 'NORMAL', ago: 52, assignee: cx2, description: 'Last three weigh-ins missing.', notes: ['Reproduced on Android. Raised with the developers.'] },
    { subject: 'Partner pharmacy asked for invoices as PDF', type: 'OTHER', status: 'OPEN', priority: 'LOW', ago: 40, description: 'Not about a patient.' },
    { p: cast.critical, subject: 'Stomach pain going to the back before starting', type: 'CLINICAL', status: 'OPEN', priority: 'URGENT', ago: 3, description: 'Asked in the consultation chat; flagged urgent.', notes: ['Doctor to call the patient today.'] },
  ];
  for (const t of ticketSpecs) {
    const created = hoursAgo(t.ago);
    const closed = t.status === 'RESOLVED' || t.status === 'CLOSED';
    await prisma.ticket.create({
      data: {
        subject: TICKET_PREFIX + t.subject, description: t.description, type: t.type, status: t.status, priority: t.priority, patientId: t.p?.id, assigneeId: t.assignee?.id, createdById: t.p?.id ?? baseCx.id, createdAt: created, updatedAt: created,
        firstResponseAt: t.assignee || t.notes ? new Date(created.getTime() + 1.5 * HOUR) : null, resolvedAt: closed ? new Date(created.getTime() + 6 * HOUR) : null,
        notes: t.notes ? { create: t.notes.map((body, i) => ({ body, authorId: t.assignee?.id ?? baseCx.id, createdAt: new Date(created.getTime() + (i + 2) * HOUR) })) } : undefined,
      },
    });
  }
  console.log(`✓ Messages and ${ticketSpecs.length} tickets`);

  // ═══ THE AUTOMATED ASSISTANT: answers, ratings and handovers for the Assistant page ═══════════════════════════════
  // The help articles it answers from (the team edits them in the portal; these are only added when missing).
  await prisma.supportArticle.createMany({ data: DEFAULT_ARTICLES.map((a) => ({ id: a.id, title: a.title, body: a.body, handoff: !!a.handoff })), skipDuplicates: true });
  const ASSISTANT = 'ai-assistant';
  const HANDOFF = 'I’ve passed this to our team, who will reply here as soon as they can. Thank you for your patience.';
  const HANDOFF_MEDICAL = 'I’ve passed your message to our doctors, who will reply here. If you feel very unwell, or have chest pain, trouble breathing or a severe reaction, call your local emergency number now instead of waiting.';
  const DID_IT_HELP = 'Did that solve it? Reply here and tell me. If not, I’ll try again or ask a colleague to help.';
  type Example = {
    who: P; days: number; question: string;
    answer?: { article: string; text: string; rating?: 'GOOD' | 'BAD'; note?: string };
    reply?: string;
    end: 'SOLVED' | 'WAITING' | 'HANDED' | 'MEDICAL' | 'PERSON';
    reason?: string; ticket?: { subject: string; type: any; priority: any };
  };
  const examples: Example[] = [
    { who: cast['lule.new'], days: 19, question: 'I forgot my password', answer: { article: 'reset-password', text: 'On the sign-in page choose “Forgot password” and enter the email you signed up with. We email a link to set a new password. If it does not arrive within a few minutes, check the spam folder and check the address is the right one.', rating: 'GOOD' }, reply: 'thanks, that worked!', end: 'SOLVED' },
    { who: cast['teuta.review'], days: 14, question: 'Where is my order? It was supposed to come days ago', answer: { article: 'track-order', text: 'Open Orders. Each order shows its stage and, once it has shipped, the courier and tracking number with a link. If something went wrong with a delivery, Orders shows a notice.', rating: 'GOOD' }, reply: 'Found it, thank you', end: 'SOLVED' },
    { who: cast['fatmir.labsok'], days: 11, question: 'how do i stop getting so many notifications on my phone?', answer: { article: 'notifications', text: 'Open Settings and use Notifications to choose what we send to your phone and by email.', rating: 'GOOD' }, reply: 'perfect thanks', end: 'SOLVED' },
    { who: cast['emine.improving'], days: 9, question: 'How can I invite my sister?', answer: { article: 'refer-and-earn', text: 'Open Refer & earn (under Settings → Account) to copy your personal link. When a friend joins through it, you both get a reward.', rating: 'GOOD' }, end: 'WAITING' },
    { who: cast['sofije.titrating'], days: 6, question: 'Where can I get a receipt for my last payment? My employer asks for it.', answer: { article: 'manage-subscription', text: 'Open Settings and use “Manage subscription”. It opens our payment provider, where you can update your card, see and download invoices, pause or cancel.' }, end: 'WAITING' },
    { who: cast['flutura.onway'], days: 5, question: 'I moved, how do I change my delivery address?', answer: { article: 'update-details', text: 'Open Profile. You can edit your delivery address and phone there. If an order has already shipped, tell us and the team will check what can be done.', rating: 'BAD', note: 'Her order had already shipped, so changing the profile does nothing. The article should say what to do in that case.' }, reply: 'but my parcel is already on the way, will it go to the new address?', end: 'HANDED', reason: 'The article “Changing my address, phone or details” did not solve it and there is nothing else to offer.', ticket: { subject: 'Address change after the parcel shipped', type: 'DELIVERY', priority: 'NORMAL' } },
    { who: cast['agim.waiting'], days: 4, question: 'my card was declined but the money left my account', answer: { article: 'manage-subscription', text: 'Open Settings and use “Manage subscription”. It opens our payment provider, where you can update your card, see and download invoices, pause or cancel.', rating: 'BAD', note: 'He was asking about a bank hold, not about updating a card. Should have gone straight to a person.' }, reply: 'no that is not my question', end: 'HANDED', reason: 'The article “Card, invoices, pausing or cancelling the subscription” did not solve it and there is nothing else to offer.', ticket: { subject: 'Card declined but a hold on the account', type: 'BILLING', priority: 'HIGH' } },
    { who: cast['burim.hematocrit'], days: 3, question: 'My gel pump is not delivering any gel, can I get a replacement?', end: 'HANDED', reason: 'No help article covers this question.', ticket: { subject: 'Gel pump not delivering, wants a replacement', type: 'DELIVERY', priority: 'NORMAL' } },
    { who: cast['valon.new'], days: 2, question: 'I have had a headache and feel dizzy since I started, is that normal?', end: 'MEDICAL', reason: 'The patient wrote about their health or medicine, which is for a doctor.', ticket: { subject: 'Headache and dizziness since starting', type: 'CLINICAL', priority: 'HIGH' } },
    { who: cast['mirlinda.stuck'], days: 1, question: 'I want to talk to a real person please', end: 'PERSON', reason: 'The patient asked for a person.', ticket: { subject: 'Wants to talk to a person', type: 'OTHER', priority: 'NORMAL' } },
  ];
  for (const e of examples) {
    const at = (offsetMin: number) => new Date(Date.now() - e.days * DAY + offsetMin * 60_000);
    const say = (from: 'patient' | 'ai', content: string, offsetMin: number, extra: Partial<Prisma.MessageUncheckedCreateInput> = {}) =>
      prisma.message.create({ data: { patientId: e.who.id, consultationId: null, senderId: from === 'patient' ? e.who.id : ASSISTANT, senderRole: from === 'patient' ? 'PATIENT' : 'CLINICIAN', content, sentAt: at(offsetMin), readAt: at(offsetMin + 1), isAi: from === 'ai', ...extra } });
    await say('patient', e.question, 0);
    if (e.answer) {
      await say('ai', `${e.answer.text}\n\n${DID_IT_HELP}`, 1, {
        aiArticleId: e.answer.article,
        ...(e.answer.rating ? { aiFeedback: e.answer.rating, aiFeedbackNote: e.answer.note ?? null, aiFeedbackById: cx2.id, aiFeedbackAt: at(240) } : {}),
      });
    }
    if (e.reply) await say('patient', e.reply, 3);
    if (e.end === 'HANDED' || e.end === 'PERSON') await say('ai', HANDOFF, 4);
    if (e.end === 'MEDICAL') await say('ai', HANDOFF_MEDICAL, 1);

    let ticketId: string | null = null;
    if (e.ticket) {
      const t = await prisma.ticket.create({
        data: {
          subject: TICKET_PREFIX + e.ticket.subject, type: e.ticket.type, priority: e.ticket.priority, status: 'OPEN', patientId: e.who.id, createdById: ASSISTANT, createdAt: at(4), updatedAt: at(4), firstResponseAt: at(4),
          description: 'Opened by the automated assistant for a patient message.',
          notes: { create: [{ authorId: ASSISTANT, body: `Handed to a person: ${e.reason}\nWhat the patient wrote last:\nPatient: ${e.reply ?? e.question}`, createdAt: at(4) }] },
        },
      });
      ticketId = t.id;
    }
    const status = e.end === 'SOLVED' ? 'DONE' : e.end === 'WAITING' ? 'AWAITING_PATIENT' : 'ESCALATED';
    await prisma.supportThread.create({
      data: {
        threadKey: `${e.who.id}:pre`, patientId: e.who.id, consultationId: null, status: status as any, attempts: e.answer ? 1 : 0, usedArticles: e.answer ? [e.answer.article] : [], ticketId,
        awaitingSince: e.end === 'WAITING' ? at(1) : null, createdAt: at(0), updatedAt: at(5),
        ...(status === 'ESCALATED' ? { escalationReason: e.reason, escalatedAt: at(4) } : {}),
      },
    });
  }
  console.log(`✓ Assistant: ${examples.length} example conversations`);

  // ═══ NOTIFICATIONS ═════════════════════════════════════════════════════════════════════════════════════════════
  const note = (who: { patientId?: string; clinicianId?: string }, kind: string, params: Record<string, string>, ago: number, o: { href?: string; read?: boolean } = {}) =>
    prisma.notification.create({ data: { ...who, kind, params, href: o.href ?? null, createdAt: hoursAgo(ago), updatedAt: hoursAgo(ago), readAt: o.read ? hoursAgo(ago - 0.5) : null } });
  const nm = (p: P) => `${p.firstName} ${p.lastName}`;
  for (const s of [baseDoctor, doctor2]) {
    await note({ clinicianId: s.id }, 'CONSULTATION_SUBMITTED', { patient: nm(cast['valon.new']) }, 2, { href: '/queue' });
    await note({ clinicianId: s.id }, 'SIDE_EFFECT_SEVERE', { patient: nm(cast['sofije.titrating']) }, 5, { href: '/patients' });
    await note({ clinicianId: s.id }, 'URGENT_APPOINTMENT', { patient: nm(cast['dardan.rough']) }, 6, { href: '/appointments' });
    await note({ clinicianId: s.id }, 'PATIENT_MESSAGE', { patient: nm(cast['mirlinda.stuck']) }, 12, { href: `/patients?patient=${cast['mirlinda.stuck'].id}&tab=messages` });
    await note({ clinicianId: s.id }, 'SIDE_EFFECT_REPORTED', { patient: nm(cast['dardan.rough']) }, 72, { read: true });
  }
  for (const s of [baseCx, cx2]) {
    await note({ clinicianId: s.id }, 'TICKET_OPENED', { patient: nm(cast.onbProgress), subject: 'Photo upload spins forever on iPhone' }, 18, { href: '/tickets' });
    await note({ clinicianId: s.id }, 'TICKET_OPENED', { patient: nm(cast.pending), subject: 'Never received the activation email' }, 3, { href: '/tickets' });
    await note({ clinicianId: s.id }, 'PATIENT_MESSAGE', { patient: nm(cast['burim.hematocrit']) }, 4, { href: '/patients' });
    await note({ clinicianId: s.id }, 'PATIENT_MESSAGE', { patient: nm(cast['ramize.problem']) }, 22, { read: true });
  }
  for (const s of [baseAdmin]) {
    await note({ clinicianId: s.id }, 'REFUND_REQUESTED', { patient: nm(cast.pending2) }, 1, { href: '/orders' });
    await note({ clinicianId: s.id }, 'REFUND_REQUESTED', { patient: nm(cast['agim.waiting']) }, 48, { href: '/orders' });
    await note({ clinicianId: s.id }, 'ORDER_PROBLEM', { patient: nm(cast['ramize.problem']) }, 20, { href: '/orders' });
  }
  const providerStaff = await prisma.clinician.findUnique({ where: { email: 'provider@clinic.dev' } });
  if (providerStaff) await note({ clinicianId: providerStaff.id }, 'CONSULTATION_SUBMITTED', { patient: nm(cast['agim.waiting']) }, 30, { href: '/orders' });
  await note({ patientId: cast['sofije.titrating'].id }, 'DOSE_DUE', {}, 2, { href: '/doses' });
  await note({ patientId: cast['sofije.titrating'].id }, 'CARE_TEAM_MESSAGE', {}, 48, { href: '/messages', read: true });
  await note({ patientId: cast['dardan.rough'].id }, 'ORDER_OUT_FOR_DELIVERY', {}, 3, { href: '/orders' });
  await note({ patientId: cast['flutura.onway'].id }, 'ORDER_SHIPPED', {}, 40, { href: '/orders' });
  await note({ patientId: cast['ramize.problem'].id }, 'ORDER_DELIVERY_FAILED', {}, 20, { href: '/orders' });
  await note({ patientId: cast['emine.improving'].id }, 'REFERRAL_REWARD', {}, 260, { href: '/rewards' });
  await note({ patientId: cast['emine.improving'].id }, 'CHECK_IN_READY', {}, 30, { href: '/checkin' });
  await note({ patientId: cast.ended.id }, 'REFUND_APPROVED', {}, 400, { read: true });
  console.log('✓ Notifications');

  // ═══ AUDIT LOG: who did what, across staff ═════════════════════════════════════════════════════════════════════
  const audits: Array<[{ id: string }, string, string, string, P | null, number, Record<string, unknown>?]> = [];
  for (const [key, p] of Object.entries(cast)) {
    if (key.includes('review') || key.includes('new') || key.includes('pending')) continue;
    audits.push([baseDoctor, 'CONSULTATION_APPROVED', 'Consultation', p.id, p, 24 * 20]);
    audits.push([baseDoctor, 'PRESCRIPTION_ISSUED', 'Prescription', p.id, p, 24 * 20 - 1]);
  }
  audits.push([baseAdmin, 'CLINICIAN_INVITED', 'Clinician', doctor2.id, null, 24 * 100, { role: 'DOCTOR' }]);
  audits.push([cx2, 'SUPPORT_RESEND_ACTIVATION_LINK', 'Patient', cast.pending.id, cast.pending, 2, { reason: 'Patient called, never got the email', ok: true }]);
  audits.push([cx2, 'TICKET_UPDATED', 'Ticket', 'showcase', cast['ramize.problem'], 18, { to: { status: 'IN_PROGRESS' } }]);
  audits.push([baseAdmin, 'REFUND_APPROVED', 'RefundRequest', 'showcase', cast.ended, 24 * 18]);
  audits.push([baseDoctor, 'LAB_RESULT_REVIEWED', 'LabResult', 'showcase', cast['fatmir.labsok'], 24 * 12]);
  audits.push([baseAdmin, 'DATA_EXPORT', 'Export', 'patients', null, 24 * 2, { resource: 'patients' }]);
  // The audit log is append-only: stable ids make a re-run skip the entries already there.
  await prisma.auditLogEntry.createMany({
    skipDuplicates: true,
    data: audits.map(([actor, action, resourceType, resourceId, p, ago, metadata], i) => ({ id: `showcase-audit-${String(i).padStart(3, '0')}`, actorId: actor.id, actorRole: 'CLINICIAN' as const, action, resourceType, resourceId, patientId: p?.id ?? null, metadata: (metadata ?? { showcase: true }) as any, timestamp: hoursAgo(ago) })),
  });
  console.log('✓ Audit log');
  printGuide();
}

function printGuide() {
  const lines = [
    '', 'Showcase data created. Every password is password123.', '',
    'STAFF LOGINS',
    '  admin@clinic.dev / admin2@clinic.dev            Admin: everything, the audit log, Team & Roles, refund decisions',
    '  doctor@clinic.dev / doctor2@clinic.dev          Doctors (verified): review queue, patients, check-ins, labs, appointments, clinical tickets',
    '  doctor3@clinic.dev                              A doctor who is NOT verified yet (cannot prescribe)',
    '  cx@clinic.dev / cx2@clinic.dev / cx3@clinic.dev Customer support: tickets, leads, patients, Quick fixes',
    '  provider@clinic.dev / provider2@clinic.dev      Pharmacy partner: orders and prescriptions to dispense',
    '  staff.deactivated@clinic.dev                    A switched-off account (Team & Roles → shows as deactivated)',
    '  staff.invited@clinic.dev                        An invitation not accepted yet',
    '',
    'WHERE TO LOOK (patients are showcase.<name>@example.com)',
    '  Tickets (CX/Admin/Doctor)   16 tickets in every status and type; doctors see only the "For the doctor" ones',
    '  Leads                       15 more leads: quiz only, health answered, at checkout, stopped, high risk, referred; from all three programmes',
    '  Review queue                new, in-review and more-info consultations; one with a CRITICAL flag and an urgent message (shpend.flag)',
    '  Patients                    27 patients across GLP-1, HRT and TRT in every onboarding and treatment state',
    '  Orders                      pending, dispatched, out for delivery, delivered, cancelled and a failed delivery (ramize.problem)',
    '  Appointments                two urgent requests (one with emergency advice), a scheduled, a completed, a cancelled; plus bookings',
    '  Check-ins                   scheduled, sent, completed and reviewed, with outcomes',
    '  Labs                        TRT monitoring (ok, high haematocrit, bloods overdue), HRT estradiol, flagged and reviewed results',
    '  Symptoms                    MRS trends (improving, stuck, first month) and AMS trends for the TRT patients',
    '  Weight journey              five GLP-1 patients with goals, daily weights, measurements, doses and side effects',
    '  Refunds                     two waiting for an admin, one approved, one declined; plus a declined consult where the refund failed',
    '  Referrals and rewards       emine.improving has an issued reward and a pending friend; fatmir.labsok an applied one',
    '  Notifications and Audit log every role has a bell with unread items; the audit log has staff actions from several people',
    '  Assistant (CX/Admin)        10 example conversations: 3 solved, 2 waiting for the patient, 5 handed to a person, with 2 bad ratings and the notes explaining them',
    '',
    'Not included: photos and uploaded files (the onboarding photo tiles stay empty).',
  ];
  console.log(lines.join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
