import { NotificationsService } from './notifications.service';

function makePrisma() {
  return {
    lead: { count: jest.fn().mockResolvedValue(0) },
    consultation: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    order: { count: jest.fn().mockResolvedValue(0) },
  };
}

describe('NotificationsService.getCounts — missed doses', () => {
  it('only scans for prescribers; other staff get 0', async () => {
    const dosing = { missedDoseAlerts: jest.fn().mockResolvedValue([{}, {}]) };
    const service = new NotificationsService(makePrisma() as any, dosing as any);

    expect((await service.getCounts()).missedDoseAlerts).toBe(0);
    expect(dosing.missedDoseAlerts).not.toHaveBeenCalled();
    expect((await service.getCounts({ includeMissedDoses: true })).missedDoseAlerts).toBe(2);
  });

  it('reuses a recent count instead of rescanning on every poll', async () => {
    const dosing = { missedDoseAlerts: jest.fn().mockResolvedValue([{}]) };
    const service = new NotificationsService(makePrisma() as any, dosing as any);
    await service.getCounts({ includeMissedDoses: true });
    await service.getCounts({ includeMissedDoses: true });
    expect(dosing.missedDoseAlerts).toHaveBeenCalledTimes(1);
  });
});
