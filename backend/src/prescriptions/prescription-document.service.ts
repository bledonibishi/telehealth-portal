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

  /**
   * Whether an order is still with the pharmacy or on its way, i.e. it has a reason to open this prescription. Once it
   * has been delivered, or cancelled, the pharmacy has no further need of it (nor of the patient's details on it).
   */
  async hasLiveOrder(prescriptionId: string): Promise<boolean> {
    return (await this.prisma.order.count({ where: { prescriptionId, status: { in: ['PENDING', 'DISPATCHED', 'OUT_FOR_DELIVERY'] } } })) > 0;
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
