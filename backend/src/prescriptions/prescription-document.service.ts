import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PRESCRIPTION_DOCUMENT_INCLUDE, hashPrescription } from './prescribing.service';
import { renderPrescriptionPdf } from './prescription-pdf';

@Injectable()
export class PrescriptionDocumentService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /** Whether an order that hasn't been cancelled is waiting on this prescription, i.e. a pharmacy has a reason to open it. */
  async hasLiveOrder(prescriptionId: string): Promise<boolean> {
    return (await this.prisma.order.count({ where: { prescriptionId, status: { not: 'CANCELLED' } } })) > 0;
  }

  async load(id: string) {
    const rx = await this.prisma.prescription.findUnique({ where: { id }, include: PRESCRIPTION_DOCUMENT_INCLUDE });
    if (!rx) throw new NotFoundException('Prescription not found');
    return rx;
  }

  render(rx: Awaited<ReturnType<PrescriptionDocumentService['load']>>): Promise<Buffer> {
    // Legacy prescriptions (issued before structured prescribing) have no hash.
    const tampered = rx.contentHash !== null && rx.contentHash !== hashPrescription(rx);
    return renderPrescriptionPdf(
      { ...rx, tampered },
      { name: this.config.get<string>('CLINIC_NAME', 'Telehealth Clinic'), address: this.config.get<string>('CLINIC_ADDRESS', '') || undefined },
    );
  }
}
