import { AiAssistService } from './ai-assist.service';

const service = (env: Record<string, string> = {}) => new AiAssistService({ get: (k: string) => env[k] } as any);

describe('AiAssistService feature switches', () => {
  it('has every helper off without a key, and sends nothing', async () => {
    const s = service();
    expect(s.enabledFeatures()).toEqual([]);
    expect(await s.json({ feature: 'brief', system: 's', user: 'u', schema: {} })).toMatchObject({ status: 'DISABLED' });
  });

  it('has nothing on just because there is a key (the document readers use the same key)', async () => {
    const s = service({ ANTHROPIC_API_KEY: 'k' });
    expect(s.enabledFeatures()).toEqual([]);
    expect(await s.json({ feature: 'urgency', system: 's', user: 'u', schema: {} })).toMatchObject({ status: 'DISABLED' });
  });

  it('turns on only what is named, and only with a key', () => {
    expect(service({ ANTHROPIC_API_KEY: 'k', AI_ENABLED_FEATURES: 'brief, Search' }).enabledFeatures()).toEqual(['brief', 'search']);
    expect(service({ AI_ENABLED_FEATURES: 'brief' }).enabledFeatures()).toEqual([]);
  });

  it('"all" turns on every helper, and a veto still wins', () => {
    expect(service({ ANTHROPIC_API_KEY: 'k', AI_ENABLED_FEATURES: 'all' }).enabledFeatures()).toEqual(['brief', 'reply', 'translate', 'urgency', 'search', 'labs']);
    // The support assistant writes to patients by itself, so "all" never switches it on: it has to be named.
    expect(service({ ANTHROPIC_API_KEY: 'k', AI_ENABLED_FEATURES: 'all' }).isEnabled('support')).toBe(false);
    expect(service({ ANTHROPIC_API_KEY: 'k', AI_ENABLED_FEATURES: 'search, support' }).isEnabled('support')).toBe(true);
    expect(service({ ANTHROPIC_API_KEY: 'k', AI_ENABLED_FEATURES: 'support', AI_DISABLED_FEATURES: 'support' }).isEnabled('support')).toBe(false);
    expect(service({ ANTHROPIC_API_KEY: 'k', AI_ENABLED_FEATURES: 'all', AI_DISABLED_FEATURES: ' Reply, urgency ' }).enabledFeatures()).toEqual(['brief', 'translate', 'search', 'labs']);
  });

  it('refuses a switched-off helper without calling out', async () => {
    const s = service({ ANTHROPIC_API_KEY: 'k', AI_ENABLED_FEATURES: 'all', AI_DISABLED_FEATURES: 'search' });
    expect(await s.json({ feature: 'search', system: 's', user: 'u', schema: {} })).toMatchObject({ status: 'DISABLED' });
  });

  it('uses the mid-tier model unless told otherwise', () => {
    expect(service().model).toBe('claude-sonnet-5-5');
    expect(service({ AI_ASSIST_MODEL: 'claude-opus-5-5' }).model).toBe('claude-opus-5-5');
  });

  it('lets one helper use a different model from the rest', () => {
    const s = service({ AI_ASSIST_MODEL: 'claude-sonnet-5-5', AI_MODEL_SEARCH: ' claude-haiku-4-5 ', AI_MODEL_TRANSLATE: 'claude-haiku-4-5' });
    expect(s.modelFor('search')).toBe('claude-haiku-4-5');
    expect(s.modelFor('translate')).toBe('claude-haiku-4-5');
    expect(s.modelFor('urgency')).toBe('claude-sonnet-5-5');
    expect(service().modelFor('reply')).toBe('claude-sonnet-5-5');
  });
});
