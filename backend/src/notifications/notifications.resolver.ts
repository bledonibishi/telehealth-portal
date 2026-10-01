import { Resolver, Query } from '@nestjs/graphql';
import { NotificationsService } from './notifications.service';
import { NotificationCounts } from './notifications.model';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { AuthUser, PRESCRIBERS, STAFF, accessRoleOf } from '../auth/access-roles';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver()
export class NotificationsResolver {
  constructor(private notificationsService: NotificationsService) {}

  @Authorized(...STAFF)
  @Query(() => NotificationCounts)
  notificationCounts(@CurrentUser() user: AuthUser) {
    const role = accessRoleOf(user);
    return this.notificationsService.getCounts({ includeMissedDoses: !!role && PRESCRIBERS.includes(role) });
  }
}
