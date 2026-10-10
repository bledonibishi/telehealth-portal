import { NotificationKind } from '@telehealth/shared-types';
import { NotifierService } from './notifier.service';

function setup({ open = null as null | { id: string; kind: string }, staff = [{ id: 'c-1', email: 'doc@x', firstName: 'Arta' }] } = {}) {
  const prisma = {
    notification: {
      findFirst: jest.fn().mockResolvedValue(open),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'n-new', count: 1, ...data })),
      update: jest.fn().mockImplementation(({ data }) => ({ id: open?.id, ...data, count: 2 })),
      updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    clinician: { findMany: jest.fn().mockResolvedValue(staff) },
    patient: {
      findUnique: jest.fn().mockResolvedValue({ pushMessages: true, pushOrders: true, pushReminders: true, pushRewards: true, emailUnreadMessages: true }),
      update: jest.fn().mockImplementation(({ data }) => data),
    },
  };
  const push = { sendToPatient: jest.fn().mockResolvedValue(undefined) };
  const email = { sendStaffAlertEmail: jest.fn().mockResolvedValue(undefined), sendConsultationUpdateEmail: jest.fn().mockResolvedValue(undefined) };
  const service = new NotifierService(prisma as any, push as any, email as any, { get: () => undefined } as any);
  return { prisma, push, email, service };
}

describe('NotifierService.toPatient', () => {
  it('writes the notification and pushes the same words to the phone, with nothing personal in them', async () => {
    const { service, prisma, push } = setup();
    await service.toPatient('p-1', { kind: NotificationKind.CARE_TEAM_MESSAGE, href: '/messages', groupKey: 'team-msg:p-1' });
    expect(prisma.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ patientId: 'p-1', kind: 'CARE_TEAM_MESSAGE', groupKey: 'team-msg:p-1' }) });
    expect(push.sendToPatient).toHaveBeenCalledWith('p-1', expect.objectContaining({ title: 'New message from your care team', data: expect.objectContaining({ notificationId: 'n-new', href: '/messages' }) }));
  });

  it('joins the unread notification about the same thing instead of adding another', async () => {
    const { service, prisma, push } = setup({ open: { id: 'n-1', kind: 'CARE_TEAM_MESSAGE' } });
    await service.toPatient('p-1', { kind: NotificationKind.CARE_TEAM_MESSAGE, groupKey: 'team-msg:p-1' });
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(prisma.notification.update).toHaveBeenCalledWith({ where: { id: 'n-1' }, data: expect.objectContaining({ count: { increment: 1 } }) });
    expect(push.sendToPatient.mock.calls[0][1].title).toBe('2 new messages from your care team');
  });

  it('keeps old app versions able to open orders from a push', async () => {
    const { service, push } = setup();
    await service.toPatient('p-1', { kind: NotificationKind.ORDER_SHIPPED, href: '/orders' });
    expect(push.sendToPatient.mock.calls[0][1].data.type).toBe('order');
  });

  it('sends a once-only notification a single time, even when the caller runs again', async () => {
    const { service, prisma, push } = setup();
    prisma.notification.count.mockResolvedValue(1);
    await service.toPatient('p-1', { kind: NotificationKind.DOSE_DUE, groupKey: 'dose:d-1', once: true });
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(push.sendToPatient).not.toHaveBeenCalled();
  });

  it('never throws: what caused it is already saved', async () => {
    const { service, prisma } = setup();
    prisma.notification.create.mockRejectedValue(new Error('db down'));
    await expect(service.toPatient('p-1', { kind: NotificationKind.REFUND_APPROVED })).resolves.toBeUndefined();
  });
});

describe('NotifierService.toStaff', () => {
  it('sends to the named staff, else to the active members with the roles given', async () => {
    const { service, prisma } = setup();
    await service.toStaff({ clinicianIds: ['c-1'] }, { kind: NotificationKind.PATIENT_MESSAGE });
    expect(prisma.clinician.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ id: { in: ['c-1'] }, deactivatedAt: null }));
    await service.toStaff({ roles: ['DOCTOR' as any] }, { kind: NotificationKind.CONSULTATION_SUBMITTED });
    expect(prisma.clinician.findMany.mock.calls[1][0].where).toEqual(expect.objectContaining({ role: { in: ['DOCTOR'] }, passwordSetAt: { not: null } }));
  });

  it('emails urgent ones without naming the patient, and not again for every further event', async () => {
    const first = setup();
    await first.service.toStaff({ roles: ['DOCTOR' as any] }, { kind: NotificationKind.URGENT_APPOINTMENT, params: { patient: 'Emma Hoxha' }, href: '/appointments', email: true });
    expect(first.email.sendStaffAlertEmail).toHaveBeenCalledWith('doc@x', 'Arta', 'Urgent appointment request', 'http://localhost:3002/appointments');
    expect(JSON.stringify(first.email.sendStaffAlertEmail.mock.calls)).not.toMatch(/Emma/);

    const again = setup({ open: { id: 'n-1', kind: 'URGENT_APPOINTMENT' } });
    await again.service.toStaff({ roles: ['DOCTOR' as any] }, { kind: NotificationKind.URGENT_APPOINTMENT, groupKey: 'appt:a-1', email: true });
    expect(again.email.sendStaffAlertEmail).not.toHaveBeenCalled();
  });

  it('emails when an unread notification becomes urgent (mild side effects, then severe ones)', async () => {
    const { service, email } = setup({ open: { id: 'n-1', kind: 'SIDE_EFFECT_REPORTED' } });
    await service.toStaff({ roles: ['DOCTOR' as any] }, { kind: NotificationKind.SIDE_EFFECT_SEVERE, groupKey: 'sidefx:p-1', email: true });
    expect(email.sendStaffAlertEmail).toHaveBeenCalledWith('doc@x', 'Arta', 'Severe side effects reported', expect.any(String));
  });
});

describe('NotifierService reading', () => {
  it('marks only the reader’s own notifications read', async () => {
    const { service, prisma } = setup();
    await service.markRead({ clinicianId: 'c-1' }, ['n-1', 'n-2']);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({ where: { clinicianId: 'c-1', readAt: null, id: { in: ['n-1', 'n-2'] } }, data: { readAt: expect.any(Date) } });
  });

  it('resolves everything about a handled thing, for everyone it went to', async () => {
    const { service, prisma } = setup();
    await service.resolve('patient-msg:p-1');
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({ where: { groupKey: 'patient-msg:p-1', readAt: null }, data: { readAt: expect.any(Date) } });
  });
});

describe('NotifierService preferences', () => {
  it('still writes the notification, but does not push a kind the patient switched off', async () => {
    const { service, prisma, push } = setup();
    prisma.patient.findUnique.mockResolvedValue({ pushOrders: false, pushMessages: true });
    await service.toPatient('p-1', { kind: NotificationKind.ORDER_SHIPPED });
    expect(prisma.notification.create).toHaveBeenCalled();
    expect(push.sendToPatient).not.toHaveBeenCalled();
  });

  it('always pushes what matters, whatever is switched off', async () => {
    const { service, prisma, push } = setup();
    prisma.patient.findUnique.mockResolvedValue({ pushMessages: false, pushOrders: false, pushReminders: false, pushRewards: false });
    await service.toPatient('p-1', { kind: NotificationKind.REFUND_APPROVED });
    await service.toPatient('p-1', { kind: NotificationKind.TREATMENT_UPDATE, params: { headline: 'x' } });
    expect(push.sendToPatient).toHaveBeenCalledTimes(2);
  });

  it('saves only known boolean settings', async () => {
    const { service, prisma } = setup();
    await service.updatePreferences('p-1', { pushRewards: false, id: 'other', pushOrders: 'no' } as any);
    expect(prisma.patient.update.mock.calls[0][0].data).toEqual({ pushRewards: false });
  });
});

describe('NotifierService.emailUnreadMessages', () => {
  const row = { id: 'n-1', patient: { email: 'a@x', firstName: 'Emma' } };

  it('emails an old unread message once, with nothing from the message in it', async () => {
    const { service, prisma, email } = setup();
    prisma.notification.findMany.mockResolvedValue([row]);
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    expect(await service.emailUnreadMessages()).toBe(1);
    const where = prisma.notification.findMany.mock.calls[0][0].where;
    expect(where).toEqual(expect.objectContaining({ kind: 'CARE_TEAM_MESSAGE', readAt: null, emailedAt: null, patient: expect.objectContaining({ emailUnreadMessages: true }) }));
    expect(email.sendConsultationUpdateEmail).toHaveBeenCalledWith('a@x', 'Emma', 'You have an unread message from your care team', 'http://localhost:3000/messages');
  });

  it('does not send when another run, or the patient reading it, got there first', async () => {
    const { service, prisma, email } = setup();
    prisma.notification.findMany.mockResolvedValue([row]);
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    expect(await service.emailUnreadMessages()).toBe(0);
    expect(email.sendConsultationUpdateEmail).not.toHaveBeenCalled();
  });

  it('lets the next run try again when the email fails', async () => {
    const { service, prisma, email } = setup();
    prisma.notification.findMany.mockResolvedValue([row]);
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    email.sendConsultationUpdateEmail.mockRejectedValue(new Error('down'));
    expect(await service.emailUnreadMessages()).toBe(0);
    expect(prisma.notification.updateMany).toHaveBeenLastCalledWith({ where: { id: 'n-1' }, data: { emailedAt: null } });
  });
});
