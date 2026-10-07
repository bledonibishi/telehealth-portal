import { Resolver, Query } from '@nestjs/graphql';
import { NotificationsService } from './notifications.service';
import { NotificationCounts } from './notifications.model';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { AuthUser, CLINICAL_STAFF, PRESCRIBERS, STAFF, accessRoleOf } from '../auth/access-roles';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver()
export class NotificationsResolver {
  constructor(private notificationsService: NotificationsService) {}

  @Authorized(...STAFF)
  @Query(() => NotificationCounts)
  async notificationCounts(@CurrentUser() user: AuthUser) {
    const role = accessRoleOf(user);
    const counts = await this.notificationsService.getCounts({
      includeMissedDoses: !!role && PRESCRIBERS.includes(role),
      includeSideEffects: !!role && PRESCRIBERS.includes(role),
      includeAppointments: !!role && PRESCRIBERS.includes(role),
      includeShipments: !!role && PRESCRIBERS.includes(role),
      includeOrderProblems: role === 'ADMIN',
    });
    // The pharmacy partner sees only the number of orders waiting for it: leads, consultations and
    // patient messages are not its business.
    if (role && !CLINICAL_STAFF.includes(role)) {
      return { ...counts, newLeads: 0, pendingConsultations: 0, patientMessages: 0, missedDoseAlerts: 0, shipmentsDue: 0, sideEffectAlerts: 0, urgentAppointments: 0, orderProblems: 0 };
    }
    return counts;
  }
}
