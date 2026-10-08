import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WeightMeasurementsService } from './weight-measurements.service';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('WeightMeasurementsService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let journey: any;
  let service: WeightMeasurementsService;

  beforeEach(() => {
    prisma = {
      uploadedFile: { findFirst: jest.fn().mockResolvedValue({ weightEntry: null }) },
      weightEntry: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'w-new' }),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        aggregate: jest.fn().mockResolvedValue({ _min: { measuredAt: null }, _max: { measuredAt: null } }),
      },
      checkIn: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({ _min: { completedAt: null }, _max: { completedAt: null } }),
      },
      $transaction: jest.fn((fn: (tx: any) => unknown) => fn(prisma)),
    };
    audit = { log: jest.fn() };
    journey = {
      requireGlp1: jest.fn().mockResolvedValue({ weightGoal: { targetWeightKg: 90 } }),
      startingPoint: jest.fn().mockReturnValue({ kg: 120, at: new Date('2026-06-01T00:00:00Z') }),
      forPatient: jest.fn().mockResolvedValue({ patientId: 'p-1' }),
    };
    service = new WeightMeasurementsService(prisma, audit as any, journey);
  });

  describe('add', () => {
    it('saves the exact instant and rounds to one decimal', async () => {
      const at = new Date(Date.now() - 2 * HOUR);
      await service.add('p-1', { weightKg: 109.04, measuredAt: at, note: '  after run  ', clientRequestId: 'req-12345678' });
      expect(prisma.weightEntry.create).toHaveBeenCalledWith({ data: { patientId: 'p-1', weightKg: 109, measuredAt: at, note: 'after run', clientRequestId: 'req-12345678', photoFileId: null } });
    });

    it('defaults to now, and allows several entries on the same day (nothing is unique per day)', async () => {
      const before = Date.now();
      await service.add('p-1', { weightKg: 109 });
      await service.add('p-1', { weightKg: 108.6 });
      expect(prisma.weightEntry.create).toHaveBeenCalledTimes(2);
      const at = prisma.weightEntry.create.mock.calls[0][0].data.measuredAt.getTime();
      expect(at).toBeGreaterThanOrEqual(before);
    });

    it.each([[0], [-1], [29.9], [300.1], [NaN], [Infinity]])('rejects weight %s', async (kg) => {
      await expect(service.add('p-1', { weightKg: kg })).rejects.toThrow(BadRequestException);
      expect(prisma.weightEntry.create).not.toHaveBeenCalled();
    });

    it('rejects the future (beyond clock slack) and dates over five years back', async () => {
      await expect(service.add('p-1', { weightKg: 100, measuredAt: new Date(Date.now() + HOUR) })).rejects.toThrow(/future/);
      await expect(service.add('p-1', { weightKg: 100, measuredAt: new Date(Date.now() + 60_000) })).resolves.toBeDefined();
      await expect(service.add('p-1', { weightKg: 100, measuredAt: new Date(Date.now() - 6 * 365 * DAY) })).rejects.toThrow(/years ago/);
      await expect(service.add('p-1', { weightKg: 100, measuredAt: new Date('nope') })).rejects.toThrow(/valid date/);
    });

    it('rejects an over-long note and a runaway number of entries', async () => {
      await expect(service.add('p-1', { weightKg: 100, note: 'x'.repeat(501) })).rejects.toThrow(/500/);
      prisma.weightEntry.count.mockResolvedValue(200);
      await expect(service.add('p-1', { weightKg: 100 })).rejects.toThrow(/lot of weights/);
    });

    describe('retrying a submission', () => {
      it('succeeds without creating a second entry when the request id was already saved — even though its photo is attached', async () => {
        prisma.weightEntry.findFirst.mockResolvedValue({ id: 'w-saved' });
        prisma.uploadedFile.findFirst.mockResolvedValue({ weightEntry: { id: 'w-saved' } }); // the photo is on that entry
        await expect(service.add('p-1', { weightKg: 100, photoFileId: 'f-1', clientRequestId: 'req-12345678' })).resolves.toEqual({ patientId: 'p-1' });
        expect(prisma.weightEntry.findFirst).toHaveBeenCalledWith({ where: { patientId: 'p-1', clientRequestId: 'req-12345678' }, select: { id: true } });
        expect(prisma.weightEntry.create).not.toHaveBeenCalled();
        expect(prisma.uploadedFile.findFirst).not.toHaveBeenCalled();
      });

      it('still refuses an attached photo for a different submission', async () => {
        prisma.weightEntry.findFirst.mockResolvedValue(null);
        prisma.uploadedFile.findFirst.mockResolvedValue({ weightEntry: { id: 'w-other' } });
        await expect(service.add('p-1', { weightKg: 100, photoFileId: 'f-1', clientRequestId: 'req-new-99999' })).rejects.toThrow(/already attached/);
      });
    });

    describe('progress photo', () => {
      it('keeps the patient’s own, unattached progress photo with the weighing', async () => {
        await service.add('p-1', { weightKg: 100, photoFileId: 'f-1' });
        expect(prisma.uploadedFile.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'f-1', patientId: 'p-1', kind: 'PROGRESS_PHOTO' } }));
        expect(prisma.weightEntry.create.mock.calls[0][0].data.photoFileId).toBe('f-1');
      });

      it('refuses a photo that is not theirs, not a progress photo, or does not exist', async () => {
        prisma.uploadedFile.findFirst.mockResolvedValue(null);
        await expect(service.add('p-1', { weightKg: 100, photoFileId: 'someone-elses' })).rejects.toThrow(/couldn’t find that photo/);
        expect(prisma.weightEntry.create).not.toHaveBeenCalled();
      });

      it('refuses a photo already attached to another weighing', async () => {
        prisma.uploadedFile.findFirst.mockResolvedValue({ weightEntry: { id: 'w-old' } });
        await expect(service.add('p-1', { weightKg: 100, photoFileId: 'f-1' })).rejects.toThrow(/already attached/);
        prisma.uploadedFile.findFirst.mockResolvedValue({ weightEntry: null });
        prisma.weightEntry.create.mockRejectedValue({ code: 'P2002', meta: { target: 'weight_entries_photo_file_id_key' } });
        await expect(service.add('p-1', { weightKg: 100, photoFileId: 'f-1', clientRequestId: 'req-1' })).rejects.toThrow(/already attached/);
      });
    });

    it('treats a repeated client request id as already saved', async () => {
      prisma.weightEntry.create.mockRejectedValue({ code: 'P2002' });
      await expect(service.add('p-1', { weightKg: 100, clientRequestId: 'req-12345678' })).resolves.toEqual({ patientId: 'p-1' });
    });

    it('still surfaces a unique-violation it cannot explain, and other errors', async () => {
      prisma.weightEntry.create.mockRejectedValue({ code: 'P2002' });
      await expect(service.add('p-1', { weightKg: 100 })).rejects.toEqual({ code: 'P2002' });
      prisma.weightEntry.create.mockRejectedValue(new Error('db down'));
      await expect(service.add('p-1', { weightKg: 100, clientRequestId: 'req-12345678' })).rejects.toThrow('db down');
    });

    it('is refused for patients outside the programme', async () => {
      journey.requireGlp1.mockRejectedValue(new BadRequestException('only weight-management'));
      await expect(service.add('p-1', { weightKg: 100 })).rejects.toThrow(/weight-management/);
      expect(prisma.weightEntry.create).not.toHaveBeenCalled();
    });
  });

  describe('voidOwn', () => {
    const entry = { id: 'w-1', patientId: 'p-1', source: 'PATIENT', voidedAt: null, weightKg: 109, measuredAt: new Date() };

    it('voids (never deletes) the patient’s own entry and audits it', async () => {
      prisma.weightEntry.findFirst.mockResolvedValue(entry);
      await service.voidOwn('p-1', 'w-1', 'typo');
      expect(prisma.weightEntry.updateMany).toHaveBeenCalledWith({
        where: { id: 'w-1', patientId: 'p-1', voidedAt: null },
        data: expect.objectContaining({ voidedById: 'p-1', voidReason: 'typo', voidedAt: expect.any(Date) }),
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'WEIGHT_ENTRY_VOIDED', actorRole: 'PATIENT', resourceId: 'w-1' }), prisma); // prisma doubles as `tx` here
    });

    it('lets go of the photo, so the picture itself is erased by the clean-up, and notes which one it was', async () => {
      prisma.weightEntry.findFirst.mockResolvedValue({ ...entry, photoFileId: 'f-1' });
      await service.voidOwn('p-1', 'w-1');
      expect(prisma.weightEntry.updateMany.mock.calls[0][0].data).toMatchObject({ photoFileId: null });
      expect(audit.log.mock.calls[0][0].metadata).toMatchObject({ photoFileId: 'f-1' });
    });

    it('looks the entry up scoped to the patient, so another patient’s id is simply not found', async () => {
      prisma.weightEntry.findFirst.mockResolvedValue(null);
      await expect(service.voidOwn('p-2', 'w-1')).rejects.toThrow(NotFoundException);
      expect(prisma.weightEntry.findFirst).toHaveBeenCalledWith({ where: { id: 'w-1', patientId: 'p-2' } });
      expect(prisma.weightEntry.updateMany).not.toHaveBeenCalled();
    });

    it('refuses an already-voided entry and one corrected by staff', async () => {
      prisma.weightEntry.findFirst.mockResolvedValue({ ...entry, voidedAt: new Date() });
      await expect(service.voidOwn('p-1', 'w-1')).rejects.toThrow(NotFoundException);
      prisma.weightEntry.findFirst.mockResolvedValue({ ...entry, source: 'STAFF' });
      await expect(service.voidOwn('p-1', 'w-1')).rejects.toThrow(/care team/);
    });

    it('loses a race cleanly (voided between the read and the write)', async () => {
      prisma.weightEntry.findFirst.mockResolvedValue(entry);
      prisma.weightEntry.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.voidOwn('p-1', 'w-1')).rejects.toThrow(NotFoundException);
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('editOwn', () => {
    const at = new Date(Date.now() - 3 * DAY);
    const entry = { id: 'w-1', patientId: 'p-1', source: 'PATIENT', deviceConnectionId: null, voidedAt: null, weightKg: '109.0', measuredAt: at, note: 'old', photoFileId: 'f-1' };
    beforeEach(() => prisma.weightEntry.findFirst.mockResolvedValue(entry));

    it('replaces the entry when the weight changes: the original is voided and kept, the photo and note move over', async () => {
      prisma.weightEntry.create.mockResolvedValue({ id: 'w-2' });
      await service.editOwn('p-1', { entryId: 'w-1', weightKg: 108.44 });
      expect(prisma.weightEntry.updateMany).toHaveBeenCalledWith({
        where: { id: 'w-1', patientId: 'p-1', voidedAt: null },
        data: { voidedAt: expect.any(Date), voidedById: 'p-1', voidReason: 'Changed by the patient', photoFileId: null },
      });
      expect(prisma.weightEntry.create).toHaveBeenCalledWith({
        data: { patientId: 'p-1', weightKg: 108.4, measuredAt: at, note: 'old', photoFileId: 'f-1', correctsId: 'w-1' },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WEIGHT_ENTRY_CORRECTED', actorRole: 'PATIENT', resourceId: 'w-1',
          metadata: expect.objectContaining({ before: expect.objectContaining({ weightKg: 109 }), after: expect.objectContaining({ weightKg: 108.4 }), replacementId: 'w-2' }),
        }),
        prisma,
      );
    });

    it('replaces the entry when only the date changes', async () => {
      const moved = new Date(Date.now() - 5 * DAY);
      await service.editOwn('p-1', { entryId: 'w-1', measuredAt: moved });
      expect(prisma.weightEntry.create.mock.calls[0][0].data).toMatchObject({ weightKg: 109, measuredAt: moved, correctsId: 'w-1' });
    });

    // The database refuses any update to this table except a void, so even a note is a replacement.
    it('replaces the entry for a note too, with the same weight, instant and photo, and says the measurement did not change', async () => {
      await service.editOwn('p-1', { entryId: 'w-1', note: '  after holiday ' });
      expect(prisma.weightEntry.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.weightEntry.updateMany.mock.calls[0][0].data).toMatchObject({ voidedById: 'p-1', voidedAt: expect.any(Date), photoFileId: null });
      expect(prisma.weightEntry.create).toHaveBeenCalledWith({
        data: { patientId: 'p-1', weightKg: 109, measuredAt: at, note: 'after holiday', photoFileId: 'f-1', correctsId: 'w-1', source: 'PATIENT', deviceConnectionId: null },
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'WEIGHT_ENTRY_EDITED' }), prisma);
    });

    it('never updates anything but the void columns and the photo link, which is all the database allows', async () => {
      for (const input of [{ weightKg: 100 }, { note: 'x' }, { removePhoto: true }, { measuredAt: new Date(Date.now() - 9 * DAY) }]) {
        prisma.weightEntry.updateMany.mockClear();
        await service.editOwn('p-1', { entryId: 'w-1', ...input });
        expect(Object.keys(prisma.weightEntry.updateMany.mock.calls[0][0].data).sort()).toEqual(['photoFileId', 'voidReason', 'voidedAt', 'voidedById']);
      }
    });

    it('removes the note with an empty string, and the photo when asked, keeping the other', async () => {
      await service.editOwn('p-1', { entryId: 'w-1', note: '' });
      expect(prisma.weightEntry.create.mock.calls[0][0].data).toMatchObject({ note: null, photoFileId: 'f-1' });
      await service.editOwn('p-1', { entryId: 'w-1', removePhoto: true });
      expect(prisma.weightEntry.create.mock.calls[1][0].data).toMatchObject({ note: 'old', photoFileId: null });
    });

    it('swaps in a new photo only when it is the patient’s own and unattached', async () => {
      await service.editOwn('p-1', { entryId: 'w-1', photoFileId: 'f-2' });
      expect(prisma.uploadedFile.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'f-2', patientId: 'p-1', kind: 'PROGRESS_PHOTO' } }));
      expect(prisma.weightEntry.create.mock.calls[0][0].data).toMatchObject({ photoFileId: 'f-2', weightKg: 109 });

      prisma.uploadedFile.findFirst.mockResolvedValue(null);
      await expect(service.editOwn('p-1', { entryId: 'w-1', photoFileId: 'f-3' })).rejects.toThrow(/couldn’t find that photo/);
    });

    it('does nothing, and writes no audit row, when nothing is different', async () => {
      await service.editOwn('p-1', { entryId: 'w-1', weightKg: 109, measuredAt: at, note: 'old', photoFileId: 'f-1' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('applies the same limits as a new entry', async () => {
      await expect(service.editOwn('p-1', { entryId: 'w-1', weightKg: 500 })).rejects.toThrow(/between/);
      await expect(service.editOwn('p-1', { entryId: 'w-1', measuredAt: new Date(Date.now() + HOUR) })).rejects.toThrow(/future/);
      await expect(service.editOwn('p-1', { entryId: 'w-1', note: 'x'.repeat(501) })).rejects.toThrow(/500/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('keeps a scale reading a scale reading when only its note or photo changes, and makes it the patient’s when they change the weight', async () => {
      prisma.weightEntry.findFirst.mockResolvedValue({ ...entry, source: 'DEVICE', deviceConnectionId: 'dev-1', externalId: 'reading-9' });
      await service.editOwn('p-1', { entryId: 'w-1', note: 'new scale' });
      const kept = prisma.weightEntry.create.mock.calls[0][0].data;
      expect(kept).toMatchObject({ source: 'DEVICE', deviceConnectionId: 'dev-1' });
      expect(kept).not.toHaveProperty('externalId'); // stays on the original: it is unique per device

      await service.editOwn('p-1', { entryId: 'w-1', weightKg: 100 });
      const typed = prisma.weightEntry.create.mock.calls[1][0].data;
      expect(typed).not.toHaveProperty('source'); // the default: PATIENT
      expect(typed).not.toHaveProperty('deviceConnectionId');
      expect(audit.log.mock.calls[1][0].metadata).toMatchObject({ source: 'DEVICE' });
    });

    it('stops a runaway number of changes in a day, as for new entries', async () => {
      prisma.weightEntry.count.mockResolvedValue(200);
      await expect(service.editOwn('p-1', { entryId: 'w-1', note: 'again' })).rejects.toThrow(/lot of weights/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('is refused for another patient’s entry, a voided one and one corrected by staff', async () => {
      prisma.weightEntry.findFirst.mockResolvedValue(null);
      await expect(service.editOwn('p-2', { entryId: 'w-1', weightKg: 100 })).rejects.toThrow(NotFoundException);
      expect(prisma.weightEntry.findFirst).toHaveBeenCalledWith({ where: { id: 'w-1', patientId: 'p-2' } });
      prisma.weightEntry.findFirst.mockResolvedValue({ ...entry, voidedAt: new Date() });
      await expect(service.editOwn('p-1', { entryId: 'w-1', weightKg: 100 })).rejects.toThrow(NotFoundException);
      prisma.weightEntry.findFirst.mockResolvedValue({ ...entry, source: 'STAFF' });
      await expect(service.editOwn('p-1', { entryId: 'w-1', weightKg: 100 })).rejects.toThrow(/care team/);
    });

    it('adds no replacement when the void loses a race, and rolls back when the audit write fails', async () => {
      prisma.weightEntry.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.editOwn('p-1', { entryId: 'w-1', weightKg: 100 })).rejects.toThrow(NotFoundException);
      expect(prisma.weightEntry.create).not.toHaveBeenCalled();

      prisma.weightEntry.updateMany.mockResolvedValue({ count: 1 });
      audit.log.mockRejectedValue(new Error('Audit log write failed'));
      await expect(service.editOwn('p-1', { entryId: 'w-1', weightKg: 100 })).rejects.toThrow('Audit log write failed');
    });
  });

  describe('staff correction', () => {
    const entry = { id: 'w-1', patientId: 'p-1', voidedAt: null, weightKg: 190, measuredAt: new Date('2026-09-29T07:51:00Z'), note: 'n' };

    it('voids the original and adds a replacement at the same instant, in one transaction, with an audit trail', async () => {
      prisma.weightEntry.findUnique.mockResolvedValue(entry);
      prisma.weightEntry.create.mockResolvedValue({ id: 'w-2' });
      await service.correct('doc-1', { entryId: 'w-1', weightKg: 109, reason: 'typo' });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.weightEntry.create).toHaveBeenCalledWith({
        data: { patientId: 'p-1', weightKg: 109, measuredAt: entry.measuredAt, note: 'n', source: 'STAFF', correctsId: 'w-1', photoFileId: null },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'WEIGHT_ENTRY_CORRECTED', metadata: expect.objectContaining({ before: 190, after: 109, reason: 'typo', replacementId: 'w-2' }) }),
        prisma, // the audit row is written inside the same transaction as the void + replacement
      );
    });

    it('moves the photo to the replacement, so the patient still sees it', async () => {
      prisma.weightEntry.findUnique.mockResolvedValue({ ...entry, photoFileId: 'f-1' });
      await service.correct('doc-1', { entryId: 'w-1', weightKg: 109, reason: 'typo' });
      expect(prisma.weightEntry.updateMany.mock.calls[0][0].data).toMatchObject({ photoFileId: null });
      expect(prisma.weightEntry.create.mock.calls[0][0].data).toMatchObject({ photoFileId: 'f-1', correctsId: 'w-1' });
    });

    it('needs a reason and a valid weight, and cannot correct twice', async () => {
      await expect(service.correct('doc-1', { entryId: 'w-1', weightKg: 109, reason: '  ' })).rejects.toThrow(/reason/);
      await expect(service.correct('doc-1', { entryId: 'w-1', weightKg: 500, reason: 'x' })).rejects.toThrow(/between/);
      prisma.weightEntry.findUnique.mockResolvedValue({ ...entry, voidedAt: new Date() });
      await expect(service.correct('doc-1', { entryId: 'w-1', weightKg: 109, reason: 'x' })).rejects.toThrow(/already/);
      expect(prisma.weightEntry.create).not.toHaveBeenCalled();
    });

    it('creates no replacement when the void loses a race', async () => {
      prisma.weightEntry.findUnique.mockResolvedValue(entry);
      prisma.weightEntry.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.correct('doc-1', { entryId: 'w-1', weightKg: 109, reason: 'x' })).rejects.toThrow(/already/);
      expect(prisma.weightEntry.create).not.toHaveBeenCalled();
    });

    it('staff void needs a reason and audits', async () => {
      prisma.weightEntry.findUnique.mockResolvedValue(entry);
      await expect(service.voidByStaff('doc-1', 'w-1', '')).rejects.toThrow(/reason/);
      await service.voidByStaff('doc-1', 'w-1', 'duplicate');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'WEIGHT_ENTRY_VOIDED', actorRole: 'CLINICIAN' }), prisma);
    });
  });

  describe('audit failure and programme guard', () => {
    const entry = { id: 'w-1', patientId: 'p-1', source: 'PATIENT', voidedAt: null, weightKg: 190, measuredAt: new Date('2026-09-29T07:51:00Z'), note: null };

    it.each([
      ['a patient voiding their own entry', () => { prisma.weightEntry.findFirst.mockResolvedValue(entry); return service.voidOwn('p-1', 'w-1'); }],
      ['staff correcting an entry', () => { prisma.weightEntry.findUnique.mockResolvedValue(entry); return service.correct('doc-1', { entryId: 'w-1', weightKg: 109, reason: 'typo' }); }],
      ['staff voiding an entry', () => { prisma.weightEntry.findUnique.mockResolvedValue(entry); return service.voidByStaff('doc-1', 'w-1', 'duplicate'); }],
    ])('fails as a whole when the audit write fails (%s)', async (_name, run) => {
      audit.log.mockRejectedValue(new Error('Audit log write failed'));
      await expect(run()).rejects.toThrow('Audit log write failed'); // thrown inside $transaction → the change rolls back
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it.each([
      ['correct', () => service.correct('doc-1', { entryId: 'w-1', weightKg: 109, reason: 'typo' })],
      ['void', () => service.voidByStaff('doc-1', 'w-1', 'duplicate')],
    ])('staff %s is refused for a patient outside the weight-management programme', async (_n, run) => {
      prisma.weightEntry.findUnique.mockResolvedValue(entry);
      journey.requireGlp1.mockRejectedValue(new BadRequestException('Weight Journey is only available on weight-management programmes'));
      await expect(run()).rejects.toThrow(/weight-management/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('timeline', () => {
    const from = new Date('2026-09-01T00:00:00Z');
    const to = new Date('2026-09-30T23:59:59Z');
    const e = (id: string, iso: string, kg: number) => ({ id, measuredAt: new Date(iso), weightKg: kg, note: null });

    it('merges daily entries and check-ins oldest first, with change from the previous weighing', async () => {
      prisma.weightEntry.findMany.mockResolvedValue([e('d2', '2026-09-29T07:51:00Z', 109), e('d1', '2026-09-28T08:32:00Z', 109.4)]);
      prisma.checkIn.findMany.mockResolvedValue([{ id: 'c1', completedAt: new Date('2026-09-10T09:00:00Z'), weightKg: 111, feeling: 'GOOD' }]);
      prisma.weightEntry.findFirst.mockResolvedValue(e('old', '2026-08-30T08:00:00Z', 112));
      const t = await service.timeline('p-1', from, to);
      expect(t.measurements.map((x) => [x.id, x.weightKg, x.kind, x.changeKg])).toEqual([
        ['c1', 111, 'CHECK_IN', -1],
        ['d1', 109.4, 'DAILY', -1.6],
        ['d2', 109, 'DAILY', -0.4],
      ]);
      expect(t.measurements[0].feeling).toBe('GOOD');
      expect(t.truncated).toBe(false);
      expect(t.startingWeightKg).toBe(120);
      expect(t.targetWeightKg).toBe(90);
    });

    it('compares the very first weighing with the starting weight', async () => {
      prisma.weightEntry.findMany.mockResolvedValue([e('d1', '2026-09-28T08:32:00Z', 118.5)]);
      expect((await service.timeline('p-1', from, to)).measurements[0].changeKg).toBe(-1.5);
    });

    it('reports the earliest and latest measurement across both sources for navigation', async () => {
      prisma.weightEntry.aggregate.mockResolvedValue({ _min: { measuredAt: new Date('2026-07-05T00:00:00Z') }, _max: { measuredAt: new Date('2026-09-29T00:00:00Z') } });
      prisma.checkIn.aggregate.mockResolvedValue({ _min: { completedAt: new Date('2026-06-20T00:00:00Z') }, _max: { completedAt: new Date('2026-09-10T00:00:00Z') } });
      const t = await service.timeline('p-1', from, to);
      expect([t.earliestAt, t.latestAt]).toEqual([new Date('2026-06-20T00:00:00Z'), new Date('2026-09-29T00:00:00Z')]);
    });

    it('is bounded: keeps the newest `limit` rows, flags truncation, and diffs against the dropped row', async () => {
      // findMany is asked for limit+1 (newest first); here limit = 2 → 3 rows come back.
      prisma.weightEntry.findMany.mockResolvedValue([e('d3', '2026-09-03T00:00:00Z', 108), e('d2', '2026-09-02T00:00:00Z', 109), e('d1', '2026-09-01T12:00:00Z', 110)]);
      const t = await service.timeline('p-1', from, to, 2);
      expect(prisma.weightEntry.findMany.mock.calls[0][0].take).toBe(3);
      expect(t.truncated).toBe(true);
      expect(t.measurements.map((x) => [x.id, x.changeKg])).toEqual([['d2', -1], ['d3', -1]]);
    });

    it('clamps the limit to the hard maximum', async () => {
      await service.timeline('p-1', from, to, 10_000_000);
      expect(prisma.weightEntry.findMany.mock.calls[0][0].take).toBe(5001);
    });

    it('rejects nonsense ranges', async () => {
      await expect(service.timeline('p-1', to, from)).rejects.toThrow(/before/);
      await expect(service.timeline('p-1', new Date('nope'), to)).rejects.toThrow(/valid/);
      await expect(service.timeline('p-1', new Date('2000-01-01'), new Date('2026-01-01'))).rejects.toThrow(/years/);
    });

    it('never reads other patients’ rows: every query is scoped to the requested patient', async () => {
      await service.timeline('p-7', from, to);
      for (const call of [prisma.weightEntry.findMany, prisma.weightEntry.findFirst, prisma.weightEntry.aggregate, prisma.checkIn.findMany, prisma.checkIn.findFirst, prisma.checkIn.aggregate]) {
        expect(call.mock.calls[0][0].where.patientId).toBe('p-7');
      }
    });

    it('excludes voided entries from every read', async () => {
      await service.timeline('p-1', from, to);
      for (const call of [prisma.weightEntry.findMany, prisma.weightEntry.findFirst, prisma.weightEntry.aggregate]) {
        expect(call.mock.calls[0][0].where.voidedAt).toBeNull();
      }
    });
  });

  describe('progress photos', () => {
    it('lists only this patient’s un-voided weighings that have a photo, oldest first', async () => {
      prisma.weightEntry.findMany.mockResolvedValue([{ id: 'w-1', measuredAt: new Date('2026-06-01'), weightKg: '120.0', photoFileId: 'f-1', source: 'PATIENT' }]);
      const photos = await service.progressPhotos('p-1');
      expect(prisma.weightEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { patientId: 'p-1', voidedAt: null, photoFileId: { not: null } },
        orderBy: { measuredAt: 'asc' },
      }));
      expect(photos).toEqual([{ entryId: 'w-1', measuredAt: new Date('2026-06-01'), weightKg: 120, photoFileId: 'f-1', note: undefined, patientCanEdit: true }]);
    });

    it('says a photo on an entry the care team corrected cannot be changed by the patient', async () => {
      prisma.weightEntry.findMany.mockResolvedValue([{ id: 'w-2', measuredAt: new Date('2026-06-01'), weightKg: '119.0', photoFileId: 'f-1', source: 'STAFF' }]);
      expect((await service.progressPhotos('p-1'))[0].patientCanEdit).toBe(false);
    });
  });

  describe('forecast', () => {
    const NOW = new Date('2026-10-01T12:00:00Z');
    it('projects from the last months of daily weighings and check-ins, up to the target', async () => {
      const entry = (daysAgo: number, kg: number) => ({ id: `w${daysAgo}`, measuredAt: new Date(NOW.getTime() - daysAgo * DAY), weightKg: String(kg), note: null, photoFileId: null });
      prisma.weightEntry.findMany.mockResolvedValue([entry(0, 95), entry(7, 95.7), entry(14, 96.4), entry(21, 97.1), entry(28, 97.8)]);
      const f = await service.forecast('p-1', NOW);
      expect(f.available).toBe(true);
      expect(f.kgPerWeek).toBeCloseTo(-0.7, 1);
      expect(f.points).toHaveLength(6);
      expect(Math.min(...f.points.map((p) => p.weightKg))).toBeGreaterThanOrEqual(90); // the target in the journey mock
      // the window it asks for is the patient's own
      expect(prisma.weightEntry.findMany.mock.calls[0][0].where.patientId).toBe('p-1');
    });

    it('says why when there is nothing to project', async () => {
      expect(await service.forecast('p-1', NOW)).toEqual({ available: false, reason: 'NOT_ENOUGH_DATA', points: [] });
    });
  });
});
