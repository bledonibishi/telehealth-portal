import { scrubForEngineers } from './tickets.service';

describe('scrubForEngineers', () => {
  it('removes emails, phone-like numbers and the patient’s name before a note goes to Slack', () => {
    const out = scrubForEngineers('Arben Gashi (arben@example.com, +383 44 123 456) cannot log in', { firstName: 'Arben', lastName: 'Gashi' });
    expect(out).not.toMatch(/arben|gashi|@|123/i);
    expect(out).toContain('cannot log in');
  });

  it('leaves an ordinary note alone', () => {
    expect(scrubForEngineers('The reset link returns a 500 error on mobile')).toBe('The reset link returns a 500 error on mobile');
  });
});
