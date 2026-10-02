import { OPEN_ALERTS_WHERE } from '../side-effects/side-effects';
import { NotificationsService } from './notifications.service';

describe('NotificationsService.getCounts — side effects', () => {
  const build = () => {
    const prisma: any = {
      lead: { count: jest.fn().mockResolvedValue(0) },
      consultation: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      order: { count: jest.fn().mockResolvedValue(0) },
      sideEffectReport: { count: jest.fn().mockResolvedValue(4) },
    };
    return { prisma, service: new NotificationsService(prisma, {} as any, {} as any) };
  };

  it('counts what the alert list shows (same filter), so the badge can always be cleared', async () => {
    const { prisma, service } = build();
    expect((await service.getCounts({ includeSideEffects: true })).sideEffectAlerts).toBe(4);
    expect(prisma.sideEffectReport.count).toHaveBeenCalledWith({ where: OPEN_ALERTS_WHERE });
  });

  it('is 0, without a query, for staff who may not see them', async () => {
    const { prisma, service } = build();
    expect((await service.getCounts()).sideEffectAlerts).toBe(0);
    expect(prisma.sideEffectReport.count).not.toHaveBeenCalled();
  });
});
