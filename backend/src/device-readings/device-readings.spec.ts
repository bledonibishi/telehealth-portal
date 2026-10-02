import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DeviceConnectionsService, MAX_ACTIVE_CONNECTIONS } from './device-connections.service';
import { DeviceReadingsController } from './device-readings.controller';
import { DeviceReadingsService, MAX_READINGS_PER_DAY, MAX_READINGS_PER_REQUEST } from './device-readings.service';
import { DEVICE_TOKEN_PREFIX, deviceTokenFrom, hashDeviceToken, newDeviceToken } from './device-token';

// Built at run time so no token-shaped literal sits in the source (secret scanners flag those).
const loginJwt = () => ['aaaa1111', 'bbbb2222', 'cccc3333'].join('.');

describe('device tokens', () => {
  it('are long, random, prefixed, and stored only as a hash', () => {
    const a = newDeviceToken();
    const b = newDeviceToken();
    expect(a.startsWith(DEVICE_TOKEN_PREFIX)).toBe(true);
    expect(a.length).toBeGreaterThan(40);
    expect(a).not.toBe(b);
    expect(hashDeviceToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDeviceToken(a)).not.toContain(a);
  });

  it('are read from a Bearer header only when they look like device tokens (a login JWT is never one)', () => {
    const t = newDeviceToken();
    expect(deviceTokenFrom(`Bearer ${t}`)).toBe(t);
    expect(deviceTokenFrom(`bearer ${t}`)).toBe(t);
    expect(deviceTokenFrom(`Bearer ${loginJwt()}`)).toBeNull();
    expect(deviceTokenFrom(t)).toBeNull();
    expect(deviceTokenFrom(undefined)).toBeNull();
  });
});

describe('DeviceConnectionsService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let service: DeviceConnectionsService;
  const row = (over: object = {}) => ({ id: 'c-1', patientId: 'p-1', provider: 'SMART_SCALE', label: 'Scale', tokenHint: 'abcd', createdAt: new Date(), lastUsedAt: null, revokedAt: null, ...over });

  beforeEach(() => {
    prisma = {
      deviceConnection: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(({ data }) => Promise.resolve(row(data))),
        findMany: jest.fn().mockResolvedValue([row()]),
        findFirst: jest.fn().mockResolvedValue(row()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(row({ revokedAt: new Date() })),
      },
      $transaction: jest.fn((fn: (tx: any) => unknown) => fn(prisma)),
    };
    audit = { log: jest.fn() };
    service = new DeviceConnectionsService(prisma, audit as any);
  });

  it('gives the token once, keeps only its hash, and audits the connection against the patient', async () => {
    const created = await service.create('p-1', { provider: 'SMART_SCALE' as any, label: '  Bathroom scale ' });
    const stored = prisma.deviceConnection.create.mock.calls[0][0].data;

    expect(created.token.startsWith('thd_')).toBe(true);
    expect(stored.tokenHash).toBe(hashDeviceToken(created.token));
    expect(JSON.stringify(stored)).not.toContain(created.token);
    expect(stored.label).toBe('Bathroom scale');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'DEVICE_CONNECTED', patientId: 'p-1', actorId: 'p-1' }), prisma);
  });

  it('never returns the token when listing', async () => {
    expect(JSON.stringify(await service.list('p-1'))).not.toContain('thd_');
    expect(prisma.deviceConnection.findMany.mock.calls[0][0].where).toEqual({ patientId: 'p-1' });
  });

  it('needs a name and limits how many connections are active', async () => {
    await expect(service.create('p-1', { provider: 'OTHER' as any, label: '  ' })).rejects.toThrow(BadRequestException);
    prisma.deviceConnection.count.mockResolvedValue(MAX_ACTIVE_CONNECTIONS);
    await expect(service.create('p-1', { provider: 'OTHER' as any, label: 'x' })).rejects.toThrow(/up to 5/);
  });

  it('revokes only the patient’s own connection, and audits it', async () => {
    await service.revoke('p-1', 'c-1');
    expect(prisma.deviceConnection.findFirst).toHaveBeenCalledWith({ where: { id: 'c-1', patientId: 'p-1' } });
    expect(prisma.deviceConnection.updateMany).toHaveBeenCalledWith({ where: { id: 'c-1', patientId: 'p-1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'DEVICE_REVOKED', patientId: 'p-1' }), prisma);
  });

  it('treats another patient’s connection as not found', async () => {
    prisma.deviceConnection.findFirst.mockResolvedValue(null);
    await expect(service.revoke('p-2', 'c-1')).rejects.toThrow(NotFoundException);
    expect(prisma.deviceConnection.updateMany).not.toHaveBeenCalled();
  });
});

describe('DeviceReadingsService', () => {
  let prisma: any;
  let journey: { requireGlp1: jest.Mock };
  let service: DeviceReadingsService;
  const AUTH = { connectionId: 'c-1', patientId: 'p-1' };
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const reading = (over: object = {}) => ({ externalId: 'r-1', weight: 94.6, measuredAt: ago(3_600_000), ...over });

  beforeEach(() => {
    prisma = {
      deviceConnection: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      weightEntry: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({}) },
    };
    journey = { requireGlp1: jest.fn().mockResolvedValue({}) };
    service = new DeviceReadingsService(prisma, journey as any);
  });

  describe('authenticate', () => {
    it('finds the connection by the hash of the token', async () => {
      const token = newDeviceToken();
      prisma.deviceConnection.findUnique.mockResolvedValue({ id: 'c-1', patientId: 'p-1', revokedAt: null, lastUsedAt: new Date() });
      expect(await service.authenticate(token)).toEqual(AUTH);
      expect(prisma.deviceConnection.findUnique).toHaveBeenCalledWith({ where: { tokenHash: hashDeviceToken(token) } });
    });

    it('gives the same 401 for no token, an unknown token and a revoked one', async () => {
      await expect(service.authenticate(null)).rejects.toThrow(UnauthorizedException);
      prisma.deviceConnection.findUnique.mockResolvedValue(null);
      await expect(service.authenticate(newDeviceToken())).rejects.toThrow('Missing or invalid device token');
      prisma.deviceConnection.findUnique.mockResolvedValue({ id: 'c-1', patientId: 'p-1', revokedAt: new Date() });
      await expect(service.authenticate(newDeviceToken())).rejects.toThrow('Missing or invalid device token');
    });

    it('notes the last use, but not on every request', async () => {
      prisma.deviceConnection.findUnique.mockResolvedValue({ id: 'c-1', patientId: 'p-1', revokedAt: null, lastUsedAt: null });
      await service.authenticate(newDeviceToken());
      expect(prisma.deviceConnection.update).toHaveBeenCalledTimes(1);
      prisma.deviceConnection.findUnique.mockResolvedValue({ id: 'c-1', patientId: 'p-1', revokedAt: null, lastUsedAt: new Date() });
      await service.authenticate(newDeviceToken());
      expect(prisma.deviceConnection.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('ingest', () => {
    it('records each reading for the connection’s patient as a DEVICE weighing', async () => {
      const result = await service.ingest(AUTH, [reading()]);
      expect(result).toEqual({ accepted: 1, duplicates: 0, rejected: [] });
      expect(prisma.weightEntry.create).toHaveBeenCalledWith({
        data: { patientId: 'p-1', weightKg: 94.6, measuredAt: expect.any(Date), source: 'DEVICE', deviceConnectionId: 'c-1', externalId: 'r-1' },
      });
    });

    it('converts pounds to kilograms', async () => {
      await service.ingest(AUTH, [reading({ weight: 200, unit: 'lb' })]);
      expect(prisma.weightEntry.create.mock.calls[0][0].data.weightKg).toBe(90.7);
    });

    it('counts a re-sent reading as a duplicate, not an error', async () => {
      prisma.weightEntry.create.mockRejectedValueOnce({ code: 'P2002' });
      expect(await service.ingest(AUTH, [reading()])).toEqual({ accepted: 0, duplicates: 1, rejected: [] });
    });

    it('rejects bad readings one by one and still saves the good ones', async () => {
      const result = await service.ingest(AUTH, [
        reading({ externalId: 'ok' }),
        reading({ externalId: 'light', weight: 12 }),
        reading({ externalId: 'future', measuredAt: new Date(Date.now() + 3_600_000).toISOString() }),
        reading({ externalId: 'old', measuredAt: ago(6 * 365 * 86_400_000) }),
        reading({ externalId: 'nan', weight: 'heavy' }),
        reading({ externalId: 'unit', unit: 'stone' }),
        reading({ externalId: 'date', measuredAt: 'yesterday-ish' }),
        { weight: 90, measuredAt: ago(1000) },
        null as any,
      ]);
      expect(result.accepted).toBe(1);
      expect(result.rejected.map((r) => r.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(result.rejected[0]).toMatchObject({ externalId: 'light', reason: expect.stringContaining('between 30 and 300') });
      expect(prisma.weightEntry.create).toHaveBeenCalledTimes(1);
    });

    it('stops accepting once the connection’s daily budget is used up', async () => {
      prisma.weightEntry.count.mockResolvedValue(MAX_READINGS_PER_DAY - 1);
      const result = await service.ingest(AUTH, [reading({ externalId: 'a' }), reading({ externalId: 'b' })]);
      expect(result.accepted).toBe(1);
      expect(result.rejected).toEqual([{ index: 1, externalId: 'b', reason: expect.stringContaining('Too many readings') }]);
    });

    it('is refused for a patient whose programme has no weight tracking', async () => {
      journey.requireGlp1.mockRejectedValue(new BadRequestException('only GLP-1'));
      await expect(service.ingest(AUTH, [reading()])).rejects.toThrow(ForbiddenException);
      expect(prisma.weightEntry.create).not.toHaveBeenCalled();
    });

    it('lets unexpected database errors surface', async () => {
      prisma.weightEntry.create.mockRejectedValue(new Error('db down'));
      await expect(service.ingest(AUTH, [reading()])).rejects.toThrow('db down');
    });
  });
});

describe('DeviceReadingsController', () => {
  const build = () => {
    const readings = { authenticate: jest.fn().mockResolvedValue({ connectionId: 'c-1', patientId: 'p-1' }), ingest: jest.fn().mockResolvedValue({ accepted: 1, duplicates: 0, rejected: [] }) };
    return { controller: new DeviceReadingsController(readings as any), readings };
  };

  it('authenticates with the device token and writes only for that connection’s patient', async () => {
    const { controller, readings } = build();
    const token = newDeviceToken();
    await controller.ingest(`Bearer ${token}`, { readings: [{ externalId: 'a', weight: 90, measuredAt: new Date().toISOString() }] });
    expect(readings.authenticate).toHaveBeenCalledWith(token);
    expect(readings.ingest).toHaveBeenCalledWith({ connectionId: 'c-1', patientId: 'p-1' }, expect.any(Array));
  });

  it('passes no token on when the header is a login JWT or missing, so it is refused', async () => {
    const { controller, readings } = build();
    await controller.ingest(`Bearer ${loginJwt()}`, { readings: [{}] });
    await controller.ingest(undefined, { readings: [{}] });
    expect(readings.authenticate).toHaveBeenNthCalledWith(1, null);
    expect(readings.authenticate).toHaveBeenNthCalledWith(2, null);
  });

  it('refuses an empty or oversized batch, and a body that is not a list', async () => {
    const { controller, readings } = build();
    const header = `Bearer ${newDeviceToken()}`;
    await expect(controller.ingest(header, { readings: [] })).rejects.toThrow(BadRequestException);
    await expect(controller.ingest(header, {} as any)).rejects.toThrow(BadRequestException);
    await expect(controller.ingest(header, { readings: Array(MAX_READINGS_PER_REQUEST + 1).fill({}) })).rejects.toThrow(/at most 100/);
    expect(readings.ingest).not.toHaveBeenCalled();
  });
});
