import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BodyMeasurementsService } from './body-measurements.service';

const DAY = 86_400_000;

describe('BodyMeasurementsService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let journey: { requireGlp1: jest.Mock };
  let service: BodyMeasurementsService;

  beforeEach(() => {
    prisma = {
      bodyMeasurement: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'm-new' }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((fn: (tx: any) => unknown) => fn(prisma)),
    };
    audit = { log: jest.fn() };
    journey = { requireGlp1: jest.fn().mockResolvedValue({}) };
    service = new BodyMeasurementsService(prisma, audit as any, journey as any);
  });

  describe('add', () => {
    it('saves the measurements given and leaves the others empty', async () => {
      await service.add('p-1', { waistCm: 92.34, clientRequestId: 'r-1' });
      expect(prisma.bodyMeasurement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ patientId: 'p-1', waistCm: 92.3, hipsCm: null, armCm: null, clientRequestId: 'r-1' }),
      });
    });

    it('needs at least one measurement', async () => {
      await expect(service.add('p-1', {})).rejects.toThrow('at least one measurement');
      expect(prisma.bodyMeasurement.create).not.toHaveBeenCalled();
    });

    it.each([
      [{ waistCm: 5 }, 'waist'],
      [{ hipsCm: 400 }, 'hip'],
      [{ armCm: 150 }, 'arm'],
      [{ waistCm: NaN }, 'waist'],
    ])('refuses an implausible size %j', async (input, label) => {
      await expect(service.add('p-1', input)).rejects.toThrow(label);
    });

    it('refuses a time in the future', async () => {
      await expect(service.add('p-1', { waistCm: 90, measuredAt: new Date(Date.now() + DAY) })).rejects.toThrow(BadRequestException);
    });

    it('refuses a date more than five years ago', async () => {
      await expect(service.add('p-1', { waistCm: 90, measuredAt: new Date(Date.now() - 6 * 365 * DAY) })).rejects.toThrow('5 years');
    });

    it('does not record the same submission twice', async () => {
      prisma.bodyMeasurement.findFirst.mockResolvedValue({ id: 'm-1' });
      await service.add('p-1', { waistCm: 90, clientRequestId: 'r-1' });
      expect(prisma.bodyMeasurement.create).not.toHaveBeenCalled();
    });

    it('treats a duplicate that raced past the check as already saved', async () => {
      prisma.bodyMeasurement.create.mockRejectedValue({ code: 'P2002' });
      await expect(service.add('p-1', { waistCm: 90, clientRequestId: 'r-1' })).resolves.toEqual([]);
    });

    it('stops a runaway client', async () => {
      prisma.bodyMeasurement.count.mockResolvedValue(50);
      await expect(service.add('p-1', { waistCm: 90 })).rejects.toThrow('try again tomorrow');
    });

    it('is only for weight-management patients', async () => {
      journey.requireGlp1.mockRejectedValue(new BadRequestException('only available on weight-management programmes'));
      await expect(service.add('p-1', { waistCm: 90 })).rejects.toThrow('weight-management');
    });
  });

  describe('list', () => {
    it('returns numbers, newest first, without voided entries', async () => {
      prisma.bodyMeasurement.findMany.mockResolvedValue([{ id: 'm-1', measuredAt: new Date('2026-10-01'), waistCm: '90.5', hipsCm: null, armCm: '31.0' }]);
      await expect(service.list('p-1')).resolves.toEqual([{ id: 'm-1', measuredAt: new Date('2026-10-01'), waistCm: 90.5, hipsCm: null, armCm: 31 }]);
      expect(prisma.bodyMeasurement.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { patientId: 'p-1', voidedAt: null } }));
    });
  });

  describe('voidOwn', () => {
    it('hides the entry and records that in the audit log in the same transaction', async () => {
      await service.voidOwn('p-1', 'm-1');
      expect(prisma.bodyMeasurement.updateMany).toHaveBeenCalledWith({ where: { id: 'm-1', patientId: 'p-1', voidedAt: null }, data: { voidedAt: expect.any(Date) } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'BODY_MEASUREMENT_VOIDED', resourceId: 'm-1', patientId: 'p-1' }), prisma);
    });

    it('cannot touch another patient’s entry or one already voided', async () => {
      prisma.bodyMeasurement.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.voidOwn('p-1', 'm-2')).rejects.toThrow(NotFoundException);
      expect(audit.log).not.toHaveBeenCalled();
    });
  });
});
