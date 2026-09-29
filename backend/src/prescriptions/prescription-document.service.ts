import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { PrescriptionStatus } from '../common/enums';
import { PRESCRIPTION_DOCUMENT_INCLUDE, hashPrescription, productLabel } from './prescribing.service';

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class PrescriptionDocumentService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async load(id: string) {
    const rx = await this.prisma.prescription.findUnique({ where: { id }, include: PRESCRIPTION_DOCUMENT_INCLUDE });
    if (!rx) throw new NotFoundException('Prescription not found');
    return rx;
  }

  render(rx: Awaited<ReturnType<PrescriptionDocumentService['load']>>): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Prescription ${rx.id}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const clinic = this.config.get<string>('CLINIC_NAME', 'Telehealth Clinic');
    const clinicAddress = this.config.get<string>('CLINIC_ADDRESS', '');

    doc.fontSize(18).font('Helvetica-Bold').text('Prescription');
    doc.fontSize(10).font('Helvetica').text(clinic);
    if (clinicAddress) doc.text(clinicAddress);
    doc.moveDown();

    // Legacy prescriptions (issued before structured prescribing) have no hash.
    const tampered = rx.contentHash !== null && rx.contentHash !== hashPrescription(rx);
    if (rx.status !== PrescriptionStatus.ACTIVE || tampered) {
      const banner = tampered
        ? 'CONTENT CHANGED SINCE ISSUE — DO NOT DISPENSE'
        : `${rx.status} — DO NOT DISPENSE${rx.cancelReason ? ` (${rx.cancelReason})` : ''}`;
      doc.fillColor('#b91c1c').fontSize(12).font('Helvetica-Bold').text(banner).fillColor('black').moveDown();
    }

    const row = (label: string, value: string) =>
      doc.fontSize(10).font('Helvetica-Bold').text(`${label}: `, { continued: true }).font('Helvetica').text(value);

    row('Prescription ID', rx.id);
    row('Issued', fmtDate(rx.issuedAt));
    if (rx.validUntil) row('Valid until', fmtDate(rx.validUntil));
    row('Repeats allowed', String(rx.refillsAllowed));
    doc.moveDown();

    doc.fontSize(12).font('Helvetica-Bold').text('Patient');
    row('Name', `${rx.patient.firstName} ${rx.patient.lastName}`);
    row('Date of birth', fmtDate(rx.patient.dateOfBirth));
    const address = [rx.patient.addressLine1, rx.patient.addressLine2, rx.patient.city, rx.patient.postcode, rx.patient.country]
      .filter(Boolean)
      .join(', ');
    if (address) row('Address', address);
    doc.moveDown();

    doc.fontSize(12).font('Helvetica-Bold').text('Medicines');
    if (rx.items.length === 0) {
      // Issued before structured prescribing — only the free-text summary exists.
      row('Medication', rx.medication);
      row('Dosage', rx.dosage);
    }
    rx.items.forEach((item, i) => {
      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica-Bold').text(`${i + 1}. ${productLabel(item.product)} ${item.strength.label}`);
      if (item.strength.packDescription) doc.fontSize(10).font('Helvetica').text(item.strength.packDescription);
      row('Quantity', `${item.quantity} pack${item.quantity === 1 ? '' : 's'}`);
      row('Directions', item.directions);
      if (item.product.requiresColdChain) doc.fontSize(9).font('Helvetica-Oblique').text('Store refrigerated (2–8 °C). Ship cold chain.');
    });
    doc.moveDown();
    doc.fontSize(12).font('Helvetica-Bold').text('Instructions');
    doc.fontSize(10).font('Helvetica').text(rx.instructions);
    doc.moveDown();

    doc.fontSize(12).font('Helvetica-Bold').text('Prescriber');
    if (rx.prescriber) {
      row('Name', `Dr ${rx.prescriber.firstName} ${rx.prescriber.lastName}`);
      row('Licence', `${rx.prescriber.licenseNumber ?? '—'} (${rx.prescriber.licensingBody ?? '—'})`);
    }
    doc.moveDown();

    doc.fontSize(8).font('Helvetica').fillColor('#555');
    doc.text('Issued electronically following a remote clinical consultation.');
    if (rx.contentHash) doc.text(`Content fingerprint (SHA-256): ${rx.contentHash}`);

    doc.end();
    return done;
  }
}
