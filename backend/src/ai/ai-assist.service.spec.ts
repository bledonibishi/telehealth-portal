import { AiAssistService } from './ai-assist.service';

const service = (env: Record<string, string> = {}) => new AiAssistService({ get: (k: string) => env[k] } as any);

describe('AiAssistService feature switches', () => {
  it('has every helper off without a key, and sends nothing', async () => {
    const s = service();
    expect(s.enabledFeatures()).toEqual([]);
    expect(await s.json({ feature: 'brief', system: 's', user: 'u', schema: {} })).toMatchObject({ status: 'DISABLED' });
  });

  it('turns them all on with a key, except those listed as off', () => {
    expect(service({ ANTHROPIC_API_KEY: 'k' }).enabledFeatures()).toEqual(['brief', 'reply', 'translate', 'urgency', 'search']);
    expect(service({ ANTHROPIC_API_KEY: 'k', AI_DISABLED_FEATURES: ' Reply, urgency ' }).enabledFeatures()).toEqual(['brief', 'translate', 'search']);
    expect(service({ ANTHROPIC_API_KEY: 'k', AI_DISABLED_FEATURES: 'reply' }).isEnabled('reply')).toBe(false);
  });

  it('refuses a switched-off helper without calling out', async () => {
    const s = service({ ANTHROPIC_API_KEY: 'k', AI_DISABLED_FEATURES: 'search' });
    expect(await s.json({ feature: 'search', system: 's', user: 'u', schema: {} })).toMatchObject({ status: 'DISABLED' });
  });

  it('uses the mid-tier model unless told otherwise', () => {
    expect(service().model).toBe('claude-sonnet-5-5');
    expect(service({ AI_ASSIST_MODEL: 'claude-opus-5-5' }).model).toBe('claude-opus-5-5');
  });
});
