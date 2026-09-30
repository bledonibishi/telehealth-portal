import { BadRequestException, Injectable } from '@nestjs/common';
import { UpdateBasicInfoInput } from './dto/update-basic-info.input';
import { UpdatePatientInput } from './dto/update-patient.input';
import { PrismaService } from '../prisma/prisma.service';
import { PrescriptionStatus } from '../common/enums';

const MIN_AGE = 18;

function ageInYears(dob: Date, now = new Date()): number {
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  // One query per relation (batched across all patients, not per row) so the
  // list can filter/sort by programme, review status and treatment status
  // without pulling every patient's full consultation/message history.
  async findAll() {
    const rows = await this.prisma.patient.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        lead: { select: { productKind: true } },
        consultations: { orderBy: { submittedAt: 'desc' }, take: 1, select: { status: true } },
        prescriptions: { where: { status: PrescriptionStatus.ACTIVE }, select: { id: true }, take: 1 },
        checkIns: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, dueAt: true } },
      },
    });

    return rows.map(({ lead, consultations, prescriptions, checkIns, ...patient }) => ({
      ...patient,
      productKind: lead?.productKind ?? null,
      latestConsultationStatus: consultations[0]?.status ?? null,
      hasActivePrescription: prescriptions.length > 0,
      lastCheckInStatus: checkIns[0]?.status ?? null,
      lastCheckInDueAt: checkIns[0]?.dueAt ?? null,
    }));
  }

  findById(id: string) {
    return this.prisma.patient.findUnique({
      where: { id },
      include: {
        consultations: {
          orderBy: { submittedAt: 'desc' },
          include: {
            redFlags: true,
            prescription: true,
            messages: { orderBy: { sentAt: 'asc' } },
            clinician: true,
          },
        },
        checkIns: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  // Covers what the marketing checkout doesn't collect (or sets a placeholder
  // for): a confirmed date of birth, and where the pharmacy delivers to.
  // Name/email already come from the lead created at checkout.
  async updateMyBasicInfo(id: string, input: UpdateBasicInfoInput) {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName || !lastName) throw new BadRequestException('Please enter your first and last name');

    const dateOfBirth = new Date(input.dateOfBirth);
    if (Number.isNaN(dateOfBirth.getTime()) || dateOfBirth > new Date()) {
      throw new BadRequestException('Please enter a valid date of birth');
    }
    if (ageInYears(dateOfBirth) < MIN_AGE) {
      throw new BadRequestException(`You must be at least ${MIN_AGE} to use this service`);
    }

    const address = Object.fromEntries(
      (['phone', 'addressLine1', 'addressLine2', 'city', 'postcode', 'country'] as const).map((k) => [
        k,
        input[k]?.trim() || null,
      ]),
    ) as Record<'phone' | 'addressLine1' | 'addressLine2' | 'city' | 'postcode' | 'country', string | null>;
    for (const key of ['phone', 'addressLine1', 'city', 'postcode', 'country'] as const) {
      if (!address[key]) throw new BadRequestException('Please fill in your phone number and full delivery address');
    }

    return this.prisma.patient.update({ where: { id }, data: { firstName, lastName, dateOfBirth, ...address } });
  }

  update(id: string, data: Omit<UpdatePatientInput, 'id'>) {
    return this.prisma.patient.update({ where: { id }, data });
  }

  async productKindOf(id: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id }, include: { lead: true } });
    return patient?.lead?.productKind ?? null;
  }

  findByEmail(email: string) {
    return this.prisma.patient.findUnique({ where: { email } });
  }
}
