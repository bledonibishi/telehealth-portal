import { ConsentsService } from './consents.service';
import { CURRENT_CONSENTS } from './consent-texts';

describe('ConsentsService.record', () => {
  const prisma: any = { consent: { create: jest.fn().mockResolvedValue({ id: 'c-1' }) } };
  const service = new ConsentsService(prisma);
  const current = CURRENT_CONSENTS.TELEHEALTH.version;

  it('stores acceptance of the current version with request details', async () => {
    await service.record('p-1', 'TELEHEALTH' as any, current, { ip: '1.2.3.4', userAgent: 'ua' });
    expect(prisma.consent.create).toHaveBeenCalledWith({
      data: { patientId: 'p-1', type: 'TELEHEALTH', version: current, ipAddress: '1.2.3.4', userAgent: 'ua' },
    });
  });

  it('requires a version', async () => {
    await expect(service.record('p-1', 'TELEHEALTH' as any, undefined, {})).rejects.toThrow(/accept the consent/);
  });

  it('refuses an outdated version', async () => {
    await expect(service.record('p-1', 'TELEHEALTH' as any, '2020-01-01', {})).rejects.toThrow(/has been updated/);
  });
});
