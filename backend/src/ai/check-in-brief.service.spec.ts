import { BadRequestException } from '@nestjs/common';
import { CheckInBriefService } from './check-in-brief.service';
import { buildFacts, type BriefInput } from './brief-facts';

const D = (s: string) => new Date(`${s}T10:00:00Z`);
const INPUT: BriefInput = {
  patient: { ageYears: 41, gender: 'FEMALE', programme: 'GLP1' },
  checkIn: { completedAt: D('2026-10-10'), weightKg: 109, feeling: 'OKAY', wantsToReorder: true, answers: [], redFlags: [] },
  previous: [{ completedAt: D('2026-09-12'), weightKg: 114, feeling: 'GOOD', outcome: 'REPEAT' }],
  startingWeightKg: 120,
  treatment: null,
  sideEffects: null,
  missedDoses: null,
  labs: [],
  orders: { count: 0, lastDispatchedAt: null },
};

function build(aiResult: any, hit: any = null) {
  const prisma: any = { aiOutput: { findUnique: jest.fn().mockResolvedValue(hit), upsert: jest.fn(({ create }) => Promise.resolve({ createdAt: new Date(), ...create })) } };
  const ai: any = { isEnabled: jest.fn().mockReturnValue(true), json: jest.fn().mockResolvedValue(aiResult) };
  const audit: any = { log: jest.fn().mockResolvedValue(undefined) };
  const svc = new CheckInBriefService(prisma, ai, audit, {} as any);
  jest.spyOn(svc, 'gather').mockResolvedValue({ input: INPUT, patientId: 'p-1' });
  return { prisma, ai, audit, svc };
}

describe('CheckInBriefService.brief', () => {
  it('shows only bullets that cite real facts and state only numbers those facts hold, and says how many it dropped', async () => {
    const { svc, prisma, audit } = build({
      status: 'COMPLETED',
      model: 'm',
      data: {
        headline: 'Weight is down since last time.',
        bullets: [
          { text: 'Weight is down 5 kg since the last check-in.', sources: ['w1'], importance: 'high' },
          { text: 'Weight is down 9 kg since the last check-in.', sources: ['w1'], importance: 'normal' },
          { text: 'Doing well.', sources: [], importance: 'normal' },
        ],
      },
    });
    const brief = await svc.brief('doc-1', 'ci-1', 'en');
    expect(brief.bullets).toHaveLength(1);
    expect(brief.bullets[0].sources[0]).toMatchObject({ id: 'w1', label: 'Weight' });
    expect(brief.bullets[0].sources[0].text).toMatch(/109 kg at this check-in/);
    expect(brief.removed).toBe(2);
    expect(prisma.aiOutput.upsert).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'AI_BRIEF_GENERATED', patientId: 'p-1', metadata: { removed: 2, language: 'en' } }));
  });

  it('gives the AI the facts as a numbered list and the language to write in, nothing identifying', async () => {
    const { svc, ai } = build({ status: 'COMPLETED', model: 'm', data: { headline: 'x', bullets: [] } });
    await svc.brief('doc-1', 'ci-1', 'sq');
    const sent = ai.json.mock.calls[0][0].user as string;
    expect(sent).toContain('Write the brief in Albanian');
    expect(sent).toMatch(/w1: 109 kg at this check-in/);
    expect(sent).not.toMatch(/@|firstName|lastName/);
  });

  it('reuses what it wrote for the same record, unless asked to write it again', async () => {
    const facts = buildFacts(INPUT);
    const hit = { output: { headline: 'Cached', bullets: [], removed: 0 }, model: 'm', createdAt: new Date() };
    const cached = build({ status: 'COMPLETED', model: 'm', data: {} }, hit);
    expect(await cached.svc.brief('doc-1', 'ci-1', 'en')).toMatchObject({ headline: 'Cached', cached: true });
    expect(cached.ai.json).not.toHaveBeenCalled();
    expect(facts.length).toBeGreaterThan(0);

    await cached.svc.brief('doc-1', 'ci-1', 'en', true);
    expect(cached.ai.json).toHaveBeenCalled();
  });

  it('says why when the AI is off or fails, and keeps nothing', async () => {
    const off = build({ status: 'FAILED', reason: 'The AI helper isn’t available right now' });
    await expect(off.svc.brief('doc-1', 'ci-1', 'en')).rejects.toThrow(BadRequestException);
    expect(off.prisma.aiOutput.upsert).not.toHaveBeenCalled();
    off.ai.isEnabled.mockReturnValue(false);
    await expect(off.svc.brief('doc-1', 'ci-1', 'en')).rejects.toThrow(/isn’t switched on/);
  });
});
