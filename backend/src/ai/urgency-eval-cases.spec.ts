import { URGENCY_CASES } from './urgency-eval-cases';

describe('the urgency check’s test messages', () => {
  it('are unique and not empty', () => {
    expect(new Set(URGENCY_CASES.map((c) => c.name)).size).toBe(URGENCY_CASES.length);
    for (const c of URGENCY_CASES) expect(c.message.trim()).toBeTruthy();
  });

  it('test both sides, with more urgent messages than routine ones', () => {
    const urgent = URGENCY_CASES.filter((c) => c.urgent).length;
    expect(urgent).toBeGreaterThanOrEqual(15);
    expect(URGENCY_CASES.length - urgent).toBeGreaterThanOrEqual(5);
  });

  it('include messages in Albanian, German and Spanish, and self-harm said indirectly', () => {
    const text = URGENCY_CASES.map((c) => c.message).join('\n');
    expect(text).toMatch(/Më shtrëngon gjoksi/);
    expect(text).toMatch(/schlecht Luft/);
    expect(text).toMatch(/no puedo más/);
    expect(URGENCY_CASES.find((c) => c.name.startsWith('wishes not to wake up'))?.urgent).toBe(true);
  });
});
