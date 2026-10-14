import { EngineeringNotifierService } from './engineering-notifier.service';

const build = (url?: string) => new EngineeringNotifierService({ get: jest.fn().mockReturnValue(url) } as any);
const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

describe('EngineeringNotifierService', () => {
  it('does nothing, and says so, when no Slack address is set', async () => {
    global.fetch = jest.fn() as any;
    expect(await build(undefined).post('hi')).toBe('NOT_CONFIGURED');
    expect(build(undefined).configured).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuses an address that is not https, so it can never point at something inside our network', async () => {
    global.fetch = jest.fn() as any;
    expect(await build('http://localhost:9000/hook').post('hi')).toBe('NOT_CONFIGURED');
    expect(await build('file:///etc/passwd').post('hi')).toBe('NOT_CONFIGURED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('posts the text to Slack', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any;
    expect(await build('https://hooks.slack.com/services/T/B/x').post('Ticket #61')).toBe('SENT');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://hooks.slack.com/services/T/B/x');
    expect(JSON.parse(init.body)).toEqual({ text: 'Ticket #61' });
  });

  it('reports a refusal or an unreachable Slack as failed, without throwing', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as any;
    expect(await build('https://hooks.slack.com/services/T/B/x').post('x')).toBe('FAILED');
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any;
    expect(await build('https://hooks.slack.com/services/T/B/x').post('x')).toBe('FAILED');
  });
});
