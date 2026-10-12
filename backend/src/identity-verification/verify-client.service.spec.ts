import { VerifyClient, VerifyServiceError } from './verify-client.service';

describe('VerifyClient', () => {
  const env: Record<string, string | undefined> = {
    VERIFY_BASE_URL: 'https://verify.example.com/',
    VERIFY_API_KEY: 'vk_secret',
  };
  const client = new VerifyClient({ get: (k: string) => env[k] } as any);
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  const fail = (status: number, body?: unknown) => ({
    ok: false,
    status,
    json: async () => {
      if (body === undefined) throw new Error('not json');
      return body;
    },
  });

  it('is configured only when both the base url and the key are set', () => {
    expect(client.isConfigured).toBe(true);
    const missingKey = new VerifyClient({ get: (k: string) => (k === 'VERIFY_BASE_URL' ? 'https://x' : undefined) } as any);
    expect(missingKey.isConfigured).toBe(false);
    expect(new VerifyClient({ get: () => undefined } as any).isConfigured).toBe(false);
  });

  it('creates a session with the key only in the Authorization header', async () => {
    fetchMock.mockResolvedValue(ok({ id: 's1', hostedUrl: 'https://x/verify#t', expiresAt: 'z', status: 'PENDING' }));
    const input = { externalRef: 'p1', firstName: 'A', lastName: 'B', birthDate: '1990-01-01' };
    await client.createSession(input);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://verify.example.com/v1/sessions');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer vk_secret');
    expect(init.redirect).toBe('error');
    expect(JSON.parse(init.body)).toEqual(input);
    expect(init.body).not.toContain('vk_secret');
  });

  it('reads a session by id', async () => {
    fetchMock.mockResolvedValue(ok({ id: 's/1', status: 'APPROVED' }));
    await client.getSession('s/1');
    expect(fetchMock.mock.calls[0][0]).toBe('https://verify.example.com/v1/sessions/s%2F1');
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
  });

  it('reports the status and code, and recognises the monthly cap', async () => {
    fetchMock.mockResolvedValue(fail(429, { code: 'monthly_cap_reached' }));
    const err = await client.createSession({} as any).catch((e) => e);
    expect(err).toBeInstanceOf(VerifyServiceError);
    expect(err.httpStatus).toBe(429);
    expect(err.isMonthlyCapReached).toBe(true);
  });

  it('keeps response bodies and the key out of error messages', async () => {
    fetchMock.mockResolvedValue(fail(400, { code: 'bad', message: 'secret details about Arta Krasniqi' }));
    const err = await client.createSession({} as any).catch((e) => e);
    expect(err.message).not.toContain('Arta');
    expect(err.message).not.toContain('vk_secret');
  });

  it('turns network failures into an error without a status', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED vk_secret'));
    const err = await client.getSession('s1').catch((e) => e);
    expect(err).toBeInstanceOf(VerifyServiceError);
    expect(err.httpStatus).toBeNull();
    expect(err.message).not.toContain('vk_secret');
  });

  it('does not retry a failed create', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));
    await client.createSession({} as any).catch(() => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
