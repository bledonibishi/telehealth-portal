import { Resolver, Query } from '@nestjs/graphql';
import { NotificationsService } from './notifications.service';
import { NotificationCounts } from './notifications.model';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { STAFF } from '../auth/access-roles';

@Resolver()
export class NotificationsResolver {
  constructor(private notificationsService: NotificationsService) {}

  @Authorized(...STAFF)
  @Query(() => NotificationCounts)
  notificationCounts() {
    return this.notificationsService.getCounts();
  }
}
