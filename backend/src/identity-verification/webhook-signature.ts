import { createHmac, timingSafeEqual } from 'crypto';

const DEFAULT_TOLERANCE_SECONDS = 300;

export interface VerifySignatureInput {
  /** The exact bytes received. Re-serialised JSON will not verify. */
  rawBody: Buffer;
  /** Value of the `X-Verify-Signature` header: `t=<unix seconds>,v1=<hex>[,v1=<hex>...]`. */
  header: string | undefined;
  secret: string;
  /** Injectable clock (ms) for tests. */
  nowMs?: number;
  toleranceSeconds?: number;
}

/**
 * Checks a verify-service webhook: `v1 = HMAC-SHA256(secret, "<t>.<raw body>")` in lowercase hex.
 * During a secret rotation the header carries several `v1=` values; any one matching is enough.
 */
export function verifyWebhookSignature(input: VerifySignatureInput): boolean {
  const { rawBody, header, secret } = input;
  if (!header || !secret) return false;

  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value);
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;

  const nowSeconds = (input.nowMs ?? Date.now()) / 1000;
  if (Math.abs(nowSeconds - Number(timestamp)) > (input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS)) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected);
  // Check every candidate (no early exit on the first mismatch) so timing does not reveal which matched.
  let matched = false;
  for (const candidate of signatures) {
    const candidateBuf = Buffer.from(candidate);
    if (candidateBuf.length === expectedBuf.length && timingSafeEqual(candidateBuf, expectedBuf)) matched = true;
  }
  return matched;
}
