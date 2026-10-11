import { UnauthorizedException } from '@nestjs/common';
import { NotificationsCronController } from './notifications-cron.controller';

function setup(secret: string | undefined = 's3cret') {
  const notifier = { emailUnreadMessages: jest.fn().mockResolvedValue(2), prune: jest.fn().mockResolvedValue(5) };
  return { notifier, controller: new NotificationsCronController({ get: () => secret } as any, notifier as any) };
}

describe('NotificationsCronController', () => {
  it('runs the jobs for the scheduler bearer token', async () => {
    const { controller, notifier } = setup();
    await expect(controller.unreadMessageEmails('Bearer s3cret')).resolves.toEqual({ sent: 2 });
    await expect(controller.pruneNotifications('Bearer s3cret')).resolves.toEqual({ deleted: 5 });
    expect(notifier.emailUnreadMessages).toHaveBeenCalledTimes(1);
  });

  it('refuses anyone else, and everyone when no secret is configured', async () => {
    const { controller, notifier } = setup();
    await expect(controller.unreadMessageEmails('Bearer wrong')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.pruneNotifications(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(setup(undefined).controller.unreadMessageEmails('Bearer undefined')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(notifier.emailUnreadMessages).not.toHaveBeenCalled();
  });
});
