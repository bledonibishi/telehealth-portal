import { SavedRepliesService, STARTER_REPLIES } from './saved-replies.service';

const cx = { id: 'cx-1', email: 'cx@x.com', role: 'CLINICIAN', clinicianRole: 'CX_TEAM' } as any;

function setup(count = 0) {
  const prisma: any = {
    savedReply: {
      count: jest.fn().mockResolvedValue(count), createMany: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'r-1', ...data })), update: jest.fn().mockResolvedValue({ id: 'r-1' }), deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  return { service: new SavedRepliesService(prisma, audit as any), prisma, audit };
}

describe('SavedRepliesService', () => {
  it('starts an empty team with a few plain replies, once', async () => {
    const empty = setup(0);
    await empty.service.list();
    expect(empty.prisma.savedReply.createMany.mock.calls[0][0].data).toHaveLength(STARTER_REPLIES.length);
    const used = setup(3);
    await used.service.list();
    expect(used.prisma.savedReply.createMany).not.toHaveBeenCalled();
  });

  it('every starter reply uses the patient’s name and promises nothing specific', () => {
    for (const r of STARTER_REPLIES) {
      expect(r.body).toContain('{name}');
      expect(r.body).not.toMatch(/refund|within \d|guarantee/i);
    }
  });

  it('creates, edits and removes, and records each', async () => {
    const { service, audit, prisma } = setup(1);
    await service.save(cx, { title: 'Hello', body: 'Hello {name}, thanks.' });
    expect(prisma.savedReply.create.mock.calls[0][0].data).toMatchObject({ createdById: 'cx-1' });
    await service.save(cx, { id: 'r-1', title: 'Hello again', body: 'Hello {name}, thanks again.' });
    await service.remove(cx, 'r-1');
    expect(audit.log.mock.calls.map((c: any[]) => c[0].action)).toEqual(['SAVED_REPLY_CREATED', 'SAVED_REPLY_EDITED', 'SAVED_REPLY_REMOVED']);
  });

  it('refuses a title or reply that is too short or long, and a 101st reply', async () => {
    const { service } = setup(1);
    await expect(service.save(cx, { title: 'x', body: 'Hello there' })).rejects.toThrow(/title/i);
    await expect(service.save(cx, { title: 'Fine', body: 'abc' })).rejects.toThrow(/reply needs/i);
    await expect(service.save(cx, { title: 'Fine', body: 'x'.repeat(1501) })).rejects.toThrow(/reply needs/i);
    await expect(setup(100).service.save(cx, { title: 'One more', body: 'Hello there, friend' })).rejects.toThrow(/already 100/);
  });
});
