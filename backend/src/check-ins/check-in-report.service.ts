import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { CheckInStatus, ConsultationKind } from '../common/enums';
import { productLabel } from '../prescriptions/prescribing.service';
import { Decision, WeightFacts, changeText, decisionOf, kgText, weekLabelFor, weightFacts } from './check-in-report';

const RX_INCLUDE = { items: { include: { product: true, strength: true } } } as const;
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export interface CheckInReportData {
  clinic: string;
  patientName: string;
  weekLabel: string;
  completedAt: Date;
  reviewedAt: Date;
  clinicianName: string | null;
  weight: WeightFacts;
  decision: Decision;
  /** What the doctor wrote for the patient. The internal clinical note is never included. */
  doctorNote: string | null;
}

export interface CheckInReportListItem {
  id: string;
  weekLabel: string;
  completedAt: Date;
  reviewedAt: Date;
  outcome: string | null;
  reportUrl: string;
}

const toRx = (rx: { medication: string; dosage: string; items: { directions: string; product: { name: string; brandName: string | null }; strength: { label: string } }[] } | null) =>
  rx && {
    medication: rx.medication,
    dosage: rx.dosage,
    items: rx.items.map((i) => ({ label: `${productLabel(i.product)} ${i.strength.label}`, directions: i.directions })),
  };

/**
 * The report a patient gets after each reviewed check-in (weeks 4, 8, 12 …): weight now and how it has moved,
 * the doctor's decision on the dose, and the note they wrote for the patient. It is drawn from the records
 * each time it is opened, so it can never disagree with them, and it is only offered inside the portal
 * (email carries no clinical detail).
 */
@Injectable()
export class CheckInReportService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /** The reviewed GLP-1 check-in a report is made from; anything else has no report. */
  async load(id: string) {
    const checkIn = await this.prisma.checkIn.findUnique({
      where: { id },
      include: { patient: true, reviewedBy: true, prescription: { include: RX_INCLUDE } },
    });
    if (!checkIn || checkIn.status !== CheckInStatus.COMPLETED || !checkIn.reviewedAt || !checkIn.completedAt || checkIn.kind !== ConsultationKind.GLP1) {
      throw new NotFoundException('There is no report for this check-in');
    }
    return checkIn;
  }

  async build(checkIn: Awaited<ReturnType<CheckInReportService['load']>>): Promise<CheckInReportData> {
    const [completed, goal, issued] = await Promise.all([
      this.prisma.checkIn.findMany({
        where: { patientId: checkIn.patientId, status: CheckInStatus.COMPLETED, completedAt: { lte: checkIn.completedAt! } },
        orderBy: { completedAt: 'asc' },
        select: { id: true, weightKg: true },
      }),
      this.prisma.weightGoal.findUnique({ where: { patientId: checkIn.patientId }, select: { startingWeightKg: true } }),
      checkIn.resultPrescriptionId ? this.prisma.prescription.findUnique({ where: { id: checkIn.resultPrescriptionId }, include: RX_INCLUDE }) : null,
    ]);
    const at = completed.findIndex((c) => c.id === checkIn.id);
    const number = at === -1 ? completed.length + 1 : at + 1;
    const previous = at > 0 ? num(completed[at - 1].weightKg) : null;

    return {
      clinic: this.config.get<string>('CLINIC_NAME', 'Telehealth Clinic'),
      patientName: `${checkIn.patient.firstName} ${checkIn.patient.lastName}`,
      weekLabel: weekLabelFor(number),
      completedAt: checkIn.completedAt!,
      reviewedAt: checkIn.reviewedAt!,
      clinicianName: checkIn.reviewedBy ? `Dr. ${checkIn.reviewedBy.firstName} ${checkIn.reviewedBy.lastName}` : null,
      weight: weightFacts(num(checkIn.weightKg), previous, num(goal?.startingWeightKg)),
      decision: decisionOf(checkIn.outcome, toRx(checkIn.prescription), toRx(issued)),
      doctorNote: checkIn.patientNote?.trim() || null,
    };
  }

  /** A patient's reports, newest first: one per reviewed GLP-1 check-in. */
  async listFor(patientId: string): Promise<CheckInReportListItem[]> {
    const rows = await this.prisma.checkIn.findMany({
      where: { patientId, status: CheckInStatus.COMPLETED, completedAt: { not: null } },
      orderBy: { completedAt: 'asc' },
      select: { id: true, completedAt: true, reviewedAt: true, outcome: true, kind: true },
    });
    return rows
      .map((r, i) => ({ r, number: i + 1 }))
      .filter(({ r }) => r.reviewedAt && r.kind === ConsultationKind.GLP1)
      .map(({ r, number }) => ({
        id: r.id,
        weekLabel: weekLabelFor(number),
        completedAt: r.completedAt!,
        reviewedAt: r.reviewedAt!,
        outcome: r.outcome,
        reportUrl: `/check-ins/${r.id}/report`,
      }))
      .reverse();
  }

  render(data: CheckInReportData): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Check-in report, ${data.weekLabel}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    doc.fontSize(18).font('Helvetica-Bold').text('Check-in report');
    doc.fontSize(12).font('Helvetica').fillColor('#475569').text(`${data.weekLabel} · ${data.clinic}`).fillColor('black').moveDown();

    const row = (label: string, value: string) =>
      doc.fontSize(10).font('Helvetica-Bold').text(`${label}: `, { continued: true }).font('Helvetica').text(value);

    row('Patient', data.patientName);
    row('Check-in completed', fmtDate(data.completedAt));
    row('Reviewed', `${fmtDate(data.reviewedAt)}${data.clinicianName ? ` by ${data.clinicianName}` : ''}`);
    doc.moveDown();

    doc.fontSize(12).font('Helvetica-Bold').text('Your weight');
    row('Now', kgText(data.weight.currentKg));
    row('At your last check-in', data.weight.previousKg == null ? 'This was your first check-in' : kgText(data.weight.previousKg));
    if (data.weight.previousKg != null) row('Change since then', changeText(data.weight.changeKg, data.weight.changePct));
    if (data.weight.startingKg != null) row('Since you started', `${kgText(data.weight.startingKg)} → ${kgText(data.weight.currentKg)} (${changeText(data.weight.lostSinceStartKg == null ? null : -data.weight.lostSinceStartKg, null)})`);
    doc.moveDown();

    doc.fontSize(12).font('Helvetica-Bold').text('Your dose');
    doc.fontSize(11).font('Helvetica-Bold').text(data.decision.title);
    if (data.decision.detail) doc.fontSize(10).font('Helvetica').text(data.decision.detail);
    doc.moveDown();

    if (data.doctorNote) {
      doc.fontSize(12).font('Helvetica-Bold').text('A note from your doctor');
      doc.fontSize(10).font('Helvetica').text(data.doctorNote);
      doc.moveDown();
    }

    doc.fontSize(8).font('Helvetica-Oblique').fillColor('#64748b').text(
      'This report summarises your check-in. It is not a prescription. If you feel unwell, message your care team; in an emergency call 112.',
      { width: 495 },
    );
    doc.end();
    return done;
  }
}
