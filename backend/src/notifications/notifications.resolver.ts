import { Resolver, Query, Mutation, Args, Int, ID } from '@nestjs/graphql';
import { Notification } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { NotifierService, type Recipient } from './notifier.service';
import { NotificationCounts, NotificationItem, NotificationPreferencesModel, UpdateNotificationPreferencesInput } from './notifications.model';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { AuthUser, CLINICAL_STAFF, PRESCRIBERS, STAFF, accessRoleOf } from '../auth/access-roles';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

const recipientOf = (user: AuthUser): Recipient => (user.role === 'PATIENT' ? { patientId: user.id } : { clinicianId: user.id });

const toItem = (n: Notification): NotificationItem => ({
  id: n.id,
  kind: n.kind,
  params: Object.entries((n.params ?? {}) as Record<string, unknown>).map(([key, value]) => ({ key, value: String(value) })),
  href: n.href ?? undefined,
  count: n.count,
  readAt: n.readAt ?? undefined,
  createdAt: n.createdAt,
  updatedAt: n.updatedAt,
});

@Resolver()
export class NotificationsResolver {
  constructor(
    private notificationsService: NotificationsService,
    private notifier: NotifierService,
  ) {}

  @Authorized(...STAFF)
  @Query(() => NotificationCounts, { description: 'What is waiting for the signed-in staff member, for the menu badges' })
  async notificationCounts(@CurrentUser() user: AuthUser) {
    const role = accessRoleOf(user);
    const counts = await this.notificationsService.getCounts({
      includeMissedDoses: !!role && PRESCRIBERS.includes(role),
      includeSideEffects: !!role && PRESCRIBERS.includes(role),
      includeAppointments: !!role && PRESCRIBERS.includes(role),
      includeShipments: !!role && PRESCRIBERS.includes(role),
      includeOrderProblems: role === 'ADMIN',
      // A doctor counts what is theirs to do: what nobody has picked up yet, and what they have.
      forClinicianId: role === 'DOCTOR' ? user.id : undefined,
    });
    // The pharmacy partner sees only the number of orders waiting for it: leads, consultations and
    // patient messages are not its business.
    if (role && !CLINICAL_STAFF.includes(role)) {
      return { ...counts, newLeads: 0, pendingConsultations: 0, patientMessages: 0, missedDoseAlerts: 0, shipmentsDue: 0, sideEffectAlerts: 0, urgentAppointments: 0, orderProblems: 0, refundRequests: 0 };
    }
    return counts;
  }

  @Authorized('PATIENT', ...CLINICAL_STAFF)
  @Query(() => [NotificationItem], { description: 'The reader\'s notifications, newest first. Pass the last one\'s updatedAt as `before` for the next page.' })
  async myNotifications(
    @CurrentUser() user: AuthUser,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('before', { nullable: true }) before?: Date,
  ) {
    return (await this.notifier.list(recipientOf(user), { limit: limit ?? 20, before })).map(toItem);
  }

  @Authorized('PATIENT', ...CLINICAL_STAFF)
  @Query(() => Int)
  unreadNotificationCount(@CurrentUser() user: AuthUser) {
    return this.notifier.unreadCount(recipientOf(user));
  }

  @Authorized('PATIENT', ...CLINICAL_STAFF)
  @Mutation(() => Int, { description: 'Marks the given notifications read (only the reader\'s own); returns how many changed' })
  markNotificationsRead(@CurrentUser() user: AuthUser, @Args('ids', { type: () => [ID] }) ids: string[]) {
    return this.notifier.markRead(recipientOf(user), ids);
  }

  @Authorized('PATIENT', ...CLINICAL_STAFF)
  @Mutation(() => Int, { description: 'Marks every notification of the reader read; returns how many changed' })
  markAllNotificationsRead(@CurrentUser() user: AuthUser) {
    return this.notifier.markRead(recipientOf(user));
  }

  @Authorized('PATIENT')
  @Query(() => NotificationPreferencesModel, { description: 'What the patient has chosen to be pushed and emailed' })
  myNotificationPreferences(@CurrentUser() user: AuthUser) {
    return this.notifier.preferences(user.id);
  }

  @Authorized('PATIENT')
  @Mutation(() => NotificationPreferencesModel)
  updateMyNotificationPreferences(@CurrentUser() user: AuthUser, @Args('input') input: UpdateNotificationPreferencesInput) {
    return this.notifier.updatePreferences(user.id, input);
  }
}
