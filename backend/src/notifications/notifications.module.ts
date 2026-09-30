import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsResolver } from './notifications.resolver';
import { PrismaModule } from '../prisma/prisma.module';
import { DosingModule } from '../dosing/dosing.module';

@Module({
  imports: [PrismaModule, DosingModule],
  providers: [NotificationsService, NotificationsResolver],
})
export class NotificationsModule {}
