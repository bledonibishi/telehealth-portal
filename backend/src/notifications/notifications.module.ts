import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsResolver } from './notifications.resolver';
import { NotificationsCronController } from './notifications-cron.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { DosingModule } from '../dosing/dosing.module';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';

@Module({
  imports: [PrismaModule, DosingModule, PrescriptionsModule],
  controllers: [NotificationsCronController],
  providers: [NotificationsService, NotificationsResolver],
})
export class NotificationsModule {}
