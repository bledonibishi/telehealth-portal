import { NotificationsResolver } from './notifications.resolver';

const COUNTS = { newLeads: 4, pendingConsultations: 3, patientMessages: 2, pendingOrders: 5, missedDoseAlerts: 1, shipmentsDue: 6, sideEffectAlerts: 1, urgentAppointments: 2, orderProblems: 3, refundRequests: 1 };

function setup() {
  const service = { getCounts: jest.fn().mockResolvedValue(COUNTS) };
  return { service, resolver: new NotificationsResolver(service as any, {} as any) };
}
const user = (clinicianRole: string, id = 'u') => ({ id, email: 'u@x', role: 'CLINICIAN', clinicianRole }) as any;

describe('NotificationsResolver.notificationCounts', () => {
  it('asks for order problems for admins only', async () => {
    const admin = setup();
    await admin.resolver.notificationCounts(user('ADMIN'));
    expect(admin.service.getCounts).toHaveBeenCalledWith(expect.objectContaining({ includeOrderProblems: true }));
    const doctor = setup();
    await doctor.resolver.notificationCounts(user('DOCTOR'));
    expect(doctor.service.getCounts).toHaveBeenCalledWith(expect.objectContaining({ includeOrderProblems: false }));
  });

  it('shows the pharmacy partner only the orders waiting for it', async () => {
    const { resolver, service } = setup();
    await expect(resolver.notificationCounts(user('PROVIDER'))).resolves.toEqual({
      newLeads: 0, pendingConsultations: 0, patientMessages: 0, pendingOrders: 5, missedDoseAlerts: 0, shipmentsDue: 0, sideEffectAlerts: 0, urgentAppointments: 0, orderProblems: 0, refundRequests: 0, ticketsToDo: 0, ticketsOverdue: 0,
    });
    expect(service.getCounts).toHaveBeenCalledWith(expect.objectContaining({ includeShipments: false, includeMissedDoses: false }));
  });

  it('counts tickets by role: support the everyday ones, a doctor the medical ones, an admin all, the pharmacy none', async () => {
    const { resolver, service } = setup();
    await resolver.notificationCounts(user('CX_TEAM', 'cx-1'));
    expect(service.getCounts).toHaveBeenLastCalledWith(expect.objectContaining({ tickets: { userId: 'cx-1', kind: 'NON_CLINICAL' } }));
    await resolver.notificationCounts(user('DOCTOR', 'dr-1'));
    expect(service.getCounts).toHaveBeenLastCalledWith(expect.objectContaining({ tickets: { userId: 'dr-1', kind: 'CLINICAL' } }));
    await resolver.notificationCounts(user('ADMIN', 'ad-1'));
    expect(service.getCounts).toHaveBeenLastCalledWith(expect.objectContaining({ tickets: { userId: 'ad-1', kind: 'ALL' } }));
    await resolver.notificationCounts(user('PROVIDER', 'pr-1'));
    expect(service.getCounts).toHaveBeenLastCalledWith(expect.objectContaining({ tickets: undefined }));
  });

  it('gives the other staff their counts', async () => {
    const { resolver, service } = setup();
    await expect(resolver.notificationCounts(user('CX_TEAM'))).resolves.toEqual(COUNTS);
    await resolver.notificationCounts(user('DOCTOR'));
    expect(service.getCounts).toHaveBeenLastCalledWith(expect.objectContaining({ includeShipments: true, includeMissedDoses: true }));
  });
});
