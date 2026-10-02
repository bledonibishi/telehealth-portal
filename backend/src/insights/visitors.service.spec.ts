import { VisitorsService } from './visitors.service';

const settings: Record<string, string> = {
  POSTHOG_PERSONAL_API_KEY: 'phx_secret',
  POSTHOG_PROJECT_ID: '12345',
  POSTHOG_HOST: 'https://us.i.posthog.com',
};
const service = (values: Record<string, string> = settings) => new VisitorsService({ get: (k: string) => values[k] } as any);
const respond = (body: unknown, status = 200) =>
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: status < 400, status, json: async () => body } as any);

afterEach(() => jest.restoreAllMocks());

describe('VisitorsService.topOfFunnel', () => {
  it('is not configured without a personal API key and project id, and asks nobody', async () => {
    const spy = jest.spyOn(global, 'fetch');
    expect(await service({ POSTHOG_HOST: 'x' }).topOfFunnel(30)).toEqual({ configured: false, data: null, error: null });
    expect(spy).not.toHaveBeenCalled();
  });

  it('asks PostHog’s query API for distinct visitors and quiz starts over the period', async () => {
    const spy = respond({ results: [[120, 45]] });
    const result = await service().topOfFunnel(30);

    expect(result).toEqual({ configured: true, data: { visitors: 120, quizStarted: 45 }, error: null });
    const [url, init] = spy.mock.calls[0] as [string, any];
    expect(url).toBe('https://us.posthog.com/api/projects/12345/query/');
    expect(init.headers.Authorization).toBe('Bearer phx_secret');
    const query = JSON.parse(init.body).query;
    expect(query.kind).toBe('HogQLQuery');
    expect(query.query).toContain("event = 'quiz_started'");
    expect(query.query).toContain("properties.$pathname = '/'");
    expect(query.query).toContain('toIntervalDay(30)');
  });

  it('reports a refused key without throwing, and tells the admin what to check', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    respond({}, 401);
    const result = await service().topOfFunnel(30);
    expect(result).toMatchObject({ configured: true, data: null });
    expect(result.error).toContain('POSTHOG_PERSONAL_API_KEY');
  });

  it('keeps the answer for a few minutes instead of asking again', async () => {
    const spy = respond({ results: [[1, 1]] });
    const s = service();
    await s.topOfFunnel(30, 1_000);
    await s.topOfFunnel(30, 60_000);
    expect(spy).toHaveBeenCalledTimes(1);
    await s.topOfFunnel(30, 6 * 60_000);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
