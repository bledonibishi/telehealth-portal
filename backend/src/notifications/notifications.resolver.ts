import { Resolver, Query } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationCounts } from './notifications.model';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';

@Resolver()
export class NotificationsResolver {
  constructor(private notificationsService: NotificationsService) {}

  @UseGuards(GqlAuthGuard)
  @Query(() => NotificationCounts)
  notificationCounts() {
    return this.notificationsService.getCounts();
  }
}
