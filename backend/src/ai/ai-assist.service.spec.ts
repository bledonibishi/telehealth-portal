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

describe('AiAssistService lookups (tools)', () => {
  const on = () => service({ ANTHROPIC_API_KEY: 'k', AI_ENABLED_FEATURES: 'support' });
  const withReplies = (s: AiAssistService, ...replies: any[]) => {
    const create = jest.fn();
    for (const r of replies) create.mockResolvedValueOnce(r);
    (s as any).client = { beta: { messages: { create } } };
    return create;
  };
  const toolUse = (name: string, input: unknown = {}) => ({ stop_reason: 'tool_use', model: 'm', usage: {}, content: [{ type: 'tool_use', id: `tu-${name}`, name, input }] });
  const answer = (data: unknown) => ({ stop_reason: 'end_turn', model: 'm', usage: {}, content: [{ type: 'text', text: JSON.stringify(data) }] });

  it('runs a lookup the model asks for, sends the result back, and returns what it looked up with the answer', async () => {
    const s = on();
    const create = withReplies(s, toolUse('get_my_orders'), answer({ ok: 1 }));
    const run = jest.fn().mockResolvedValue({ orders: [{ stage: 'DISPATCHED' }] });
    const r = await s.json({ feature: 'support', system: 's', user: 'u', schema: {}, tools: [{ name: 'get_my_orders', description: 'd', run }] });
    expect(r).toMatchObject({ status: 'COMPLETED', data: { ok: 1 }, toolOutputs: [{ name: 'get_my_orders', output: '{"orders":[{"stage":"DISPATCHED"}]}' }] });
    expect(create.mock.calls[0][0].tools[0]).toMatchObject({ name: 'get_my_orders', strict: true });
    const second = create.mock.calls[1][0].messages;
    expect(second.at(-1).content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'tu-get_my_orders', content: '{"orders":[{"stage":"DISPATCHED"}]}' });
  });

  it('tells the model when a tool does not exist or failed, instead of dropping the call', async () => {
    const s = on();
    const create = withReplies(s, toolUse('delete_everything'), toolUse('get_my_orders'), answer({}));
    await s.json({ feature: 'support', system: 's', user: 'u', schema: {}, tools: [{ name: 'get_my_orders', description: 'd', run: jest.fn().mockRejectedValue(new Error('db down')) }] });
    expect(create.mock.calls[1][0].messages.at(-1).content[0]).toMatchObject({ is_error: true });
    expect(create.mock.calls[2][0].messages.at(-1).content[0]).toMatchObject({ is_error: true, content: expect.not.stringContaining('db down') });
  });

  it('gives up on a model that keeps looking things up without answering', async () => {
    const s = on();
    withReplies(s, toolUse('t'), toolUse('t'), toolUse('t'), toolUse('t'), toolUse('t'));
    const r = await s.json({ feature: 'support', system: 's', user: 'u', schema: {}, tools: [{ name: 't', description: 'd', run: async () => ({}) }] });
    expect(r).toMatchObject({ status: 'FAILED' });
  });

  it('can be asked to use another model for one call (the small checker)', async () => {
    const s = on();
    const create = withReplies(s, answer({ grounded: true }));
    await s.json({ feature: 'support', system: 's', user: 'u', schema: {}, model: s.checkerModel() });
    expect(create.mock.calls[0][0].model).toBe('claude-haiku-4-5');
    expect(create.mock.calls[0][0].tools).toBeUndefined();
    expect(service({ AI_MODEL_CHECKER: 'claude-sonnet-5-5' }).checkerModel()).toBe('claude-sonnet-5-5');
  });
});
