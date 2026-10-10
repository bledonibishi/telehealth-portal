import { toText } from '../email-layout';
import { SAMPLES } from './samples';

describe('email templates', () => {
  it.each(SAMPLES.map((s) => [s.name, s.content] as const))('%s renders a subject, branded HTML and a readable plain-text copy', (_name, content) => {
    expect(content.subject.trim()).not.toBe('');
    expect(content.html).toContain('Omopharmacy');
    const text = toText(content.html);
    expect(text.length).toBeGreaterThan(20);
    expect(text).not.toMatch(/<(div|table|td|a |p>)/i);
  });

  it('every template has a sample, so the preview shows them all', () => {
    expect(SAMPLES.map((s) => s.name)).toHaveLength(17);
  });
});
