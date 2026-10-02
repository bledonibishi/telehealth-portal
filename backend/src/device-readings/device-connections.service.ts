import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '../common/enums';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashDeviceToken, newDeviceToken, tokenHint } from './device-token';
import { CreateDeviceConnectionInput, CreatedDeviceConnectionModel, DeviceConnectionModel } from './models/device-connection.model';

export const MAX_ACTIVE_CONNECTIONS = 5;
const MAX_LABEL_LENGTH = 60;

const toModel = (c: { id: string; provider: any; label: string; tokenHint: string; createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null }): DeviceConnectionModel => ({
  id: c.id,
  provider: c.provider,
  label: c.label,
  tokenHint: c.tokenHint,
  createdAt: c.createdAt,
  lastUsedAt: c.lastUsedAt ?? undefined,
  revokedAt: c.revokedAt ?? undefined,
});

/** A patient allowing a device or health app to send their weight, and taking that back. */
@Injectable()
export class DeviceConnectionsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(patientId: string, input: CreateDeviceConnectionInput): Promise<CreatedDeviceConnectionModel> {
    const label = input.label?.trim();
    if (!label) throw new BadRequestException('Please name this connection');
    if (label.length > MAX_LABEL_LENGTH) throw new BadRequestException(`Names can be up to ${MAX_LABEL_LENGTH} characters`);
    const active = await this.prisma.deviceConnection.count({ where: { patientId, revokedAt: null } });
    if (active >= MAX_ACTIVE_CONNECTIONS) throw new BadRequestException(`You can have up to ${MAX_ACTIVE_CONNECTIONS} connections — remove one first`);

    const token = newDeviceToken();
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.deviceConnection.create({
        data: { patientId, provider: input.provider, label, tokenHash: hashDeviceToken(token), tokenHint: tokenHint(token) },
      });
      await this.audit.log(
        { actorId: patientId, actorRole: UserRole.PATIENT, action: 'DEVICE_CONNECTED', resourceType: 'DeviceConnection', resourceId: created.id, patientId, metadata: { provider: input.provider } },
        tx,
      );
      return created;
    });
    return { ...toModel(row), token };
  }

  async list(patientId: string): Promise<DeviceConnectionModel[]> {
    const rows = await this.prisma.deviceConnection.findMany({ where: { patientId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map(toModel);
  }

  /** Stops the token working at once. The weights it already sent stay (they are the patient's measurements). */
  async revoke(patientId: string, id: string): Promise<DeviceConnectionModel> {
    const existing = await this.prisma.deviceConnection.findFirst({ where: { id, patientId } });
    if (!existing) throw new NotFoundException('Connection not found');
    if (existing.revokedAt) return toModel(existing);

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.deviceConnection.updateMany({ where: { id, patientId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log(
        { actorId: patientId, actorRole: UserRole.PATIENT, action: 'DEVICE_REVOKED', resourceType: 'DeviceConnection', resourceId: id, patientId, metadata: { provider: existing.provider } },
        tx,
      );
      return tx.deviceConnection.findUniqueOrThrow({ where: { id } });
    });
    return toModel(row);
  }
}
