import { createHmac } from 'crypto';
import { verifyWebhookSignature } from './webhook-signature';

const SECRET = 'whsec_test';
const NOW_MS = Date.UTC(2026, 9, 5, 12, 0, 0);
const T = Math.floor(NOW_MS / 1000);
const body = Buffer.from('{"eventId":"e1","status":"APPROVED"}');

const sign = (t: number, raw: Buffer, secret = SECRET) =>
  createHmac('sha256', secret).update(`${t}.`).update(raw).digest('hex');

describe('verifyWebhookSignature', () => {
  const check = (header: string | undefined, raw = body, extra: object = {}) =>
    verifyWebhookSignature({ rawBody: raw, header, secret: SECRET, nowMs: NOW_MS, ...extra });

  it('accepts a correctly signed body', () => {
    expect(check(`t=${T},v1=${sign(T, body)}`)).toBe(true);
  });

  it('rejects a body changed by one byte', () => {
    const tampered = Buffer.from('{"eventId":"e1","status":"APPROVEd"}');
    expect(check(`t=${T},v1=${sign(T, body)}`, tampered)).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    expect(check(`t=${T},v1=${sign(T, body, 'whsec_other')}`)).toBe(false);
  });

  it('rejects a timestamp that was altered after signing', () => {
    expect(check(`t=${T + 1},v1=${sign(T, body)}`)).toBe(false);
  });

  it('rejects timestamps more than 5 minutes away, in either direction', () => {
    expect(check(`t=${T - 301},v1=${sign(T - 301, body)}`)).toBe(false);
    expect(check(`t=${T + 301},v1=${sign(T + 301, body)}`)).toBe(false);
    expect(check(`t=${T - 299},v1=${sign(T - 299, body)}`)).toBe(true);
  });

  it('accepts any matching v1 during a secret rotation', () => {
    const old = sign(T, body, 'whsec_old');
    expect(check(`t=${T},v1=${old},v1=${sign(T, body)}`)).toBe(true);
    expect(check(`t=${T},v1=${sign(T, body)},v1=${old}`)).toBe(true);
    expect(check(`t=${T},v1=${old},v1=${old}`)).toBe(false);
  });

  it('rejects missing, empty and malformed headers', () => {
    expect(check(undefined)).toBe(false);
    expect(check('')).toBe(false);
    expect(check('garbage')).toBe(false);
    expect(check(`v1=${sign(T, body)}`)).toBe(false);
    expect(check(`t=${T}`)).toBe(false);
    expect(check(`t=abc,v1=${sign(T, body)}`)).toBe(false);
    expect(check(`t=${T},v1=short`)).toBe(false);
  });

  it('rejects everything when no secret is configured', () => {
    expect(
      verifyWebhookSignature({ rawBody: body, header: `t=${T},v1=${sign(T, body, '')}`, secret: '', nowMs: NOW_MS }),
    ).toBe(false);
  });
});
