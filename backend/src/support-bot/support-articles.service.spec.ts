import { SupportArticlesService } from './support-articles.service';
import { DEFAULT_ARTICLES } from './support-knowledge';

const cx = { id: 'cx-1', email: 'cx@x.com', role: 'CLINICIAN', clinicianRole: 'CX_TEAM' } as any;
const good = { id: 'delivery-times', title: 'How long delivery takes', body: 'Open Orders to see the stage of each delivery and its tracking number once it has shipped.' };

function setup(count = 0) {
  const prisma: any = {
    supportArticle: {
      count: jest.fn().mockResolvedValue(count), createMany: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve(create)), update: jest.fn().mockResolvedValue({ id: 'x' }),
    },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  return { service: new SupportArticlesService(prisma, audit as any), prisma, audit };
}

describe('SupportArticlesService', () => {
  it('puts the starting articles in the database the first time, and only then', async () => {
    const empty = setup(0);
    await empty.service.list();
    expect(empty.prisma.supportArticle.createMany.mock.calls[0][0].data).toHaveLength(DEFAULT_ARTICLES.length);
    const full = setup(5);
    await full.service.list();
    expect(full.prisma.supportArticle.createMany).not.toHaveBeenCalled();
  });

  it('gives the assistant only the active articles, and remembers them for a moment', async () => {
    const { service, prisma } = setup(5);
    prisma.supportArticle.findMany.mockResolvedValue([{ id: 'a', title: 'A', body: 'text', handoff: false }]);
    expect(await service.active()).toEqual([{ id: 'a', title: 'A', body: 'text', handoff: false }]);
    await service.active();
    expect(prisma.supportArticle.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.supportArticle.findMany.mock.calls[0][0].where).toEqual({ active: true });
  });

  it('saves an article and records who wrote it', async () => {
    const { service, audit, prisma } = setup(5);
    await service.save(cx, good);
    expect(prisma.supportArticle.upsert.mock.calls[0][0].create).toMatchObject({ id: 'delivery-times', updatedById: 'cx-1' });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUPPORT_ARTICLE_CREATED', resourceId: 'delivery-times' }));
  });

  it('refuses a bad name, a too-short body, and an article that promises something or asks for personal details', async () => {
    const { service, prisma } = setup(5);
    await expect(service.save(cx, { ...good, id: 'Bad Name!' })).rejects.toThrow(/short name/i);
    await expect(service.save(cx, { ...good, body: 'too short' })).rejects.toThrow(/20 to 1200/);
    await expect(service.save(cx, { ...good, body: 'Please reply with your email address and we\'ll make sure you get a new link right away.' })).rejects.toThrow(/promise/i);
    expect(prisma.supportArticle.upsert).not.toHaveBeenCalled();
  });

  it('switches an article off and on, and notes it', async () => {
    const { service, audit, prisma } = setup(5);
    await service.setActive(cx, 'x', false);
    expect(prisma.supportArticle.update.mock.calls[0][0].data.active).toBe(false);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUPPORT_ARTICLE_DEACTIVATED' }));
  });
});
