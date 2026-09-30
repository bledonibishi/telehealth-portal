import { UnauthorizedException } from '@nestjs/common';
import { DosingCronController } from './dosing-cron.controller';

function makeConfig(secret?: string) {
  return { get: jest.fn().mockReturnValue(secret) };
}

function makeDosing(sent = 3) {
  return { sendReminders: jest.fn().mockResolvedValue(sent) };
}

describe('DosingCronController.triggerDoseReminders', () => {
  it('rejects a request with no CRON_SECRET configured', async () => {
    const dosing = makeDosing();
    const controller = new DosingCronController(makeConfig(undefined) as any, dosing as any);
    await expect(controller.triggerDoseReminders('Bearer anything')).rejects.toThrow(UnauthorizedException);
    expect(dosing.sendReminders).not.toHaveBeenCalled();
  });

  it('rejects a request with the wrong bearer token', async () => {
    const dosing = makeDosing();
    const controller = new DosingCronController(makeConfig('secret') as any, dosing as any);
    await expect(controller.triggerDoseReminders('Bearer wrong')).rejects.toThrow(UnauthorizedException);
    expect(dosing.sendReminders).not.toHaveBeenCalled();
  });

  it('rejects a request with no authorization header at all', async () => {
    const dosing = makeDosing();
    const controller = new DosingCronController(makeConfig('secret') as any, dosing as any);
    await expect(controller.triggerDoseReminders(undefined)).rejects.toThrow(UnauthorizedException);
  });

  it('triggers the reminder job and returns the count when the secret matches', async () => {
    const dosing = makeDosing(5);
    const controller = new DosingCronController(makeConfig('secret') as any, dosing as any);
    const result = await controller.triggerDoseReminders('Bearer secret');
    expect(result).toEqual({ sent: 5 });
    expect(dosing.sendReminders).toHaveBeenCalledTimes(1);
  });
});
