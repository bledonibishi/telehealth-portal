import { TicketsService } from './tickets.service';

const support = { id: 'cx-1', email: 'cx@x.com', role: 'CLINICIAN', clinicianRole: 'CX_TEAM' } as any;
const doctor = { id: 'dr-1', email: 'dr@x.com', role: 'CLINICIAN', clinicianRole: 'DOCTOR' } as any;
const admin = { id: 'ad-1', email: 'ad@x.com', role: 'CLINICIAN', clinicianRole: 'ADMIN' } as any;

const row = (over: any = {}) => ({
  id: 't-1', number: 1, type: 'TECHNICAL', status: 'OPEN', priority: 'NORMAL', subject: 's', description: null, patientId: 'p-1',
  assigneeId: null, createdById: 'cx-1', createdAt: new Date(), updatedAt: new Date(), firstResponseAt: null, resolvedAt: null,
  patient: { firstName: 'A', lastName: 'B' }, assignee: null, notes: [], attachments: [], ...over,
});

function setup(existing = row()) {
  const tx: any = {
    ticket: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve(row(data))), update: jest.fn().mockImplementation(({ data }) => Promise.resolve(row({ ...existing, ...data }))) },
    ticketNote: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma: any = {
    ticket: { findFirst: jest.fn().mockResolvedValue(existing), findMany: jest.fn().mockResolvedValue([]) },
    patient: { findUnique: jest.fn().mockResolvedValue({ id: 'p-1' }) },
    clinician: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  return { service: new TicketsService(prisma, audit as any), prisma, tx, audit };
}

describe('TicketsService visibility', () => {
  it('limits a doctor to clinical tickets', async () => {
    const { service, prisma } = setup();
    await service.list(doctor);
    expect(prisma.ticket.findMany.mock.calls[0][0].where).toMatchObject({ type: 'CLINICAL' });
  });

  it('shows support everything', async () => {
    const { service, prisma } = setup();
    await service.list(support);
    expect(prisma.ticket.findMany.mock.calls[0][0].where).toEqual({});
  });
});

describe('TicketsService.create', () => {
  it('records who opened it in the audit log', async () => {
    const { service, audit } = setup();
    await service.create(support, { subject: 'App will not open', type: 'TECHNICAL' as any, patientId: 'p-1' });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'TICKET_CREATED', actorId: 'cx-1', patientId: 'p-1' }), expect.anything());
  });

  it('refuses a doctor opening a non-clinical ticket', async () => {
    const { service } = setup();
    await expect(service.create(doctor, { subject: 'Billing thing', type: 'BILLING' as any })).rejects.toThrow(/clinical/i);
  });

  it('refuses a too-short subject', async () => {
    const { service } = setup();
    await expect(service.create(support, { subject: 'a', type: 'OTHER' as any })).rejects.toThrow(/subject/i);
  });
});

describe('TicketsService.update', () => {
  it('lets support hand a ticket to the doctors', async () => {
    const { service, tx } = setup();
    await service.update(support, { id: 't-1', type: 'CLINICAL' as any });
    expect(tx.ticket.update.mock.calls[0][0].data.type).toBe('CLINICAL');
  });

  it('stops support taking a clinical ticket back from the doctors', async () => {
    const { service } = setup(row({ type: 'CLINICAL' }));
    await expect(service.update(support, { id: 't-1', type: 'BILLING' as any })).rejects.toThrow(/doctor/i);
  });

  it('stops support closing a clinical ticket', async () => {
    const { service } = setup(row({ type: 'CLINICAL' }));
    await expect(service.update(support, { id: 't-1', status: 'RESOLVED' as any })).rejects.toThrow(/doctor/i);
  });

  it('lets a doctor close a clinical ticket and stamps when it was resolved', async () => {
    const { service, tx } = setup(row({ type: 'CLINICAL' }));
    await service.update(doctor, { id: 't-1', status: 'RESOLVED' as any });
    expect(tx.ticket.update.mock.calls[0][0].data.resolvedAt).toBeInstanceOf(Date);
  });

  it('clears resolvedAt when a ticket is reopened', async () => {
    const { service, tx } = setup(row({ status: 'RESOLVED', resolvedAt: new Date() }));
    await service.update(support, { id: 't-1', status: 'OPEN' as any });
    expect(tx.ticket.update.mock.calls[0][0].data.resolvedAt).toBeNull();
  });

  it('only assigns a clinical ticket to a doctor', async () => {
    const { service, prisma } = setup(row({ type: 'CLINICAL' }));
    prisma.clinician.findFirst.mockResolvedValue({ role: 'CX_TEAM' });
    await expect(service.update(admin, { id: 't-1', assigneeId: 'cx-1' })).rejects.toThrow(/doctor/i);
  });

  it('writes an audit entry with what changed', async () => {
    const { service, audit } = setup();
    await service.update(support, { id: 't-1', priority: 'URGENT' as any });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'TICKET_UPDATED' }), expect.anything());
  });
});

describe('TicketsService.addNote', () => {
  it('refuses an empty note', async () => {
    const { service } = setup();
    await expect(service.addNote(support, 't-1', '   ')).rejects.toThrow();
  });

  it('counts the first note as the first response', async () => {
    const { service, tx } = setup();
    await service.addNote(support, 't-1', 'Called the patient');
    expect(tx.ticket.update.mock.calls[0][0].data.firstResponseAt).toBeInstanceOf(Date);
  });
});

describe('TicketsService.openAsPatient', () => {
  function patientSetup(recent = 0) {
    const s = setup();
    s.prisma.ticket.count = jest.fn().mockResolvedValue(recent);
    s.prisma.patient.findUnique.mockResolvedValue({ firstName: 'Pat', lastName: 'Lee' });
    const notifier = { toStaff: jest.fn().mockResolvedValue(undefined) };
    const service = new TicketsService(s.prisma, s.audit as any, notifier as any);
    return { ...s, service, notifier };
  }

  it('sends a technical request to support, as normal priority', async () => {
    const { service, tx, notifier } = patientSetup();
    await service.openAsPatient('p-1', { subject: 'App crashes on start', type: 'TECHNICAL' as any });
    expect(tx.ticket.create.mock.calls[0][0].data).toMatchObject({ priority: 'NORMAL', patientId: 'p-1', createdById: 'p-1' });
    expect(notifier.toStaff).toHaveBeenCalledWith({ roles: ['CX_TEAM'] }, expect.objectContaining({ href: '/tickets' }));
  });

  it('sends a medical question to the doctors, as high priority', async () => {
    const { service, tx, notifier } = patientSetup();
    await service.openAsPatient('p-1', { subject: 'Dizzy after my dose', type: 'CLINICAL' as any });
    expect(tx.ticket.create.mock.calls[0][0].data.priority).toBe('HIGH');
    expect(notifier.toStaff).toHaveBeenCalledWith({ roles: ['DOCTOR'] }, expect.anything());
  });

  it('stops a patient flooding the team', async () => {
    const { service, tx } = patientSetup(5);
    await expect(service.openAsPatient('p-1', { subject: 'Another one', type: 'OTHER' as any })).rejects.toThrow(/already/i);
    expect(tx.ticket.create).not.toHaveBeenCalled();
  });

  it('still saves the request when telling the team fails', async () => {
    const { service, notifier } = patientSetup();
    notifier.toStaff.mockRejectedValue(new Error('down'));
    await expect(service.openAsPatient('p-1', { subject: 'Where is my parcel', type: 'DELIVERY' as any })).resolves.toMatchObject({ subject: 'Where is my parcel' });
  });

  it('shows the patient no internal notes or assignee', async () => {
    const { service, prisma } = patientSetup();
    prisma.ticket.findMany.mockResolvedValue([row({ notes: [{ id: 'n', authorId: 'x', body: 'secret', createdAt: new Date() }], assigneeId: 'cx-1' })]);
    const [mine] = await service.listForPatient('p-1');
    expect(mine).not.toHaveProperty('notes');
    expect(mine).not.toHaveProperty('assigneeId');
  });
});

describe('TicketsService.openAsPatient with attachments', () => {
  function withFiles(own: number) {
    const s = setup();
    s.prisma.ticket.count = jest.fn().mockResolvedValue(0);
    s.prisma.patient.findUnique.mockResolvedValue({ firstName: 'Pat', lastName: 'Lee' });
    s.prisma.uploadedFile = { count: jest.fn().mockResolvedValue(own) };
    s.tx.uploadedFile = { updateMany: jest.fn().mockResolvedValue({ count: own }), findMany: jest.fn().mockResolvedValue([{ id: 'f-1', filename: 'error.png', mimeType: 'image/png', createdAt: new Date() }]) };
    return { ...s, service: new TicketsService(s.prisma, s.audit as any, { toStaff: jest.fn().mockResolvedValue(undefined) } as any) };
  }
  const input = (ids: string[]) => ({ subject: 'App error', type: 'TECHNICAL' as any, attachmentIds: ids });

  it('attaches the patient’s own unsent files to the new ticket', async () => {
    const { service, tx, prisma } = withFiles(1);
    const result: any = await service.openAsPatient('p-1', input(['f-1']));
    expect(prisma.uploadedFile.count).toHaveBeenCalledWith({ where: { id: { in: ['f-1'] }, patientId: 'p-1', kind: 'SUPPORT_ATTACHMENT', ticketId: null, messageId: null } });
    expect(tx.uploadedFile.updateMany.mock.calls[0][0].data).toEqual({ ticketId: 't-1' === 't-1' ? expect.any(String) : '' });
    expect(result.attachments).toHaveLength(1);
  });

  it('refuses a file that is not theirs, already sent, or the wrong kind', async () => {
    const { service, tx } = withFiles(0);
    await expect(service.openAsPatient('p-1', input(['someone-elses']))).rejects.toThrow(/could not be attached/i);
    expect(tx.ticket.create).not.toHaveBeenCalled();
  });

  it('allows at most three files', async () => {
    const { service } = withFiles(4);
    await expect(service.openAsPatient('p-1', input(['a', 'b', 'c', 'd']))).rejects.toThrow(/up to 3/i);
  });
});

describe('TicketsService replying from a ticket', () => {
  it('stops support replying to a medical ticket, and a ticket with no patient', async () => {
    const clinical = setup(row({ type: 'CLINICAL' }));
    await expect(clinical.service.assertCanReply(support, 't-1')).rejects.toThrow(/doctor/i);
    await expect(clinical.service.assertCanReply(doctor, 't-1')).resolves.toBeDefined();
    const noPatient = setup(row({ patientId: null }));
    await expect(noPatient.service.assertCanReply(support, 't-1')).rejects.toThrow(/no patient/i);
  });

  it('counts a reply as the first one, waits on the patient, and takes an unassigned ticket', async () => {
    const { service, tx } = setup(row({ status: 'OPEN', firstResponseAt: null, assigneeId: null }));
    await service.recordStaffReply(support, 't-1');
    const data = tx.ticket.update.mock.calls[0][0].data;
    expect(data.firstResponseAt).toBeInstanceOf(Date);
    expect(data.status).toBe('WAITING_ON_PATIENT');
    expect(data.assignee).toEqual({ connect: { id: 'cx-1' } });
  });

  it('leaves a ticket someone already has, and an answered first reply, as they are', async () => {
    const { service, tx } = setup(row({ status: 'IN_PROGRESS', firstResponseAt: new Date(), assigneeId: 'dr-1' }));
    await service.recordStaffReply(support, 't-1');
    const data = tx.ticket.update.mock.calls[0][0].data;
    expect(data.firstResponseAt).toBeUndefined();
    expect(data.assignee).toBeUndefined();
  });
});

describe('TicketsService telling someone a ticket was given to them', () => {
  const withNotifier = () => {
    const s = setup(row({ assigneeId: null }));
    s.prisma.clinician.findFirst.mockResolvedValue({ role: 'CX_TEAM' });
    s.prisma.clinician.findUnique = jest.fn().mockResolvedValue({ firstName: 'Alice', lastName: 'Admin' });
    const notifier = { toStaff: jest.fn().mockResolvedValue(undefined) };
    return { ...s, notifier, service: new TicketsService(s.prisma, s.audit as any, notifier as any) };
  };

  it('notifies the person who now has it, saying who gave it', async () => {
    const { service, notifier } = withNotifier();
    await service.update(admin, { id: 't-1', assigneeId: 'cx-2' });
    await new Promise((r) => setImmediate(r));
    expect(notifier.toStaff).toHaveBeenCalledWith({ clinicianIds: ['cx-2'] }, expect.objectContaining({ kind: 'TICKET_ASSIGNED', params: expect.objectContaining({ by: 'Alice Admin' }), href: '/tickets/t-1' }));
  });

  it('does not notify someone who gave a ticket to themselves', async () => {
    const { service, notifier } = withNotifier();
    await service.update(admin, { id: 't-1', assigneeId: 'ad-1' });
    await new Promise((r) => setImmediate(r));
    expect(notifier.toStaff).not.toHaveBeenCalled();
  });
});

describe('TicketsService passing a ticket to the engineers', () => {
  const build = (existing = row(), slack = 'SENT') => {
    const s = setup(existing);
    const engineering = { post: jest.fn().mockResolvedValue(slack) };
    return { ...s, engineering, service: new TicketsService(s.prisma, s.audit as any, undefined, engineering as any) };
  };

  it('marks the ticket, leaves a note, records it and tells Slack: the note, the number and a link, never the patient', async () => {
    const { service, tx, audit, engineering } = build(row({ number: 61, subject: 'Mario Rossi cannot sign in', patient: { firstName: 'Mario', lastName: 'Rossi' } }));
    const result = await service.sendToEngineering(support, 't-1', 'The sign-in page shows a white screen on Android 14 after the update.');
    const data = tx.ticket.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ engineeringSentById: 'cx-1', engineeringDoneAt: null });
    expect(data.engineeringSentAt).toBeInstanceOf(Date);
    expect(data.notes.create.body).toMatch(/Passed to the engineers/);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'TICKET_SENT_TO_ENGINEERING' }), expect.anything());
    const text: string = engineering.post.mock.calls[0][0];
    expect(text).toContain('#61');
    expect(text).toContain('white screen on Android 14');
    expect(text).toContain('/tickets/t-1');
    expect(text).not.toMatch(/Mario|Rossi/);
    expect(result.slack).toBe('SENT');
  });

  it('still marks the ticket when Slack is not set up or is down, and says so', async () => {
    expect((await build(row(), 'NOT_CONFIGURED').service.sendToEngineering(support, 't-1', 'The app crashes when opening Orders.')).slack).toBe('NOT_CONFIGURED');
    expect((await build(row(), 'FAILED').service.sendToEngineering(support, 't-1', 'The app crashes when opening Orders.')).slack).toBe('FAILED');
  });

  it('needs a real description, and refuses a ticket that is already with them', async () => {
    const { service } = build();
    await expect(service.sendToEngineering(support, 't-1', 'broken')).rejects.toThrow(/at least 10/i);
    const already = build(row({ engineeringSentAt: new Date(), engineeringDoneAt: null }));
    await expect(already.service.sendToEngineering(support, 't-1', 'Still broken after the update.')).rejects.toThrow(/already with the engineers/i);
  });

  it('takes the mark off when the engineers are done, and only then', async () => {
    const { service, tx, audit } = build(row({ engineeringSentAt: new Date(), engineeringDoneAt: null }));
    await service.finishEngineering(support, 't-1');
    expect(tx.ticket.update.mock.calls[0][0].data.engineeringDoneAt).toBeInstanceOf(Date);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'TICKET_BACK_FROM_ENGINEERING' }), expect.anything());
    await expect(build(row()).service.finishEngineering(support, 't-1')).rejects.toThrow(/not with the engineers/i);
  });
});

describe('TicketsService.handToSupport', () => {
  it('opens a support ticket for the same patient and notes the hand-over on the clinical one', async () => {
    const { service, prisma, tx, audit } = setup(row({ id: 't-9', number: 9, type: 'CLINICAL', priority: 'URGENT' }));
    prisma.ticket.findUnique = jest.fn().mockResolvedValue(null);
    await service.handToSupport(doctor, 't-9', 'Asks when the parcel arrives');
    expect(tx.ticket.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'OTHER', patientId: 'p-1', priority: 'HIGH' }) }));
    expect(tx.ticket.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 't-9' } }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'TICKET_HANDED_TO_SUPPORT', actorId: 'dr-1' }), expect.anything());
  });

  it('refuses a ticket that is not clinical', async () => {
    const { service } = setup(row({ type: 'BILLING' }));
    await expect(service.handToSupport(doctor, 't-1', 'Please help with the invoice')).rejects.toThrow(/medical ticket/);
  });

  it('asks for a note that says what the patient needs', async () => {
    const { service } = setup(row({ type: 'CLINICAL' }));
    await expect(service.handToSupport(doctor, 't-1', 'ok')).rejects.toThrow(/few words/);
  });
});
