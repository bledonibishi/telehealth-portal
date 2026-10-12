import { CONFIG } from './config';

// Proof that the visitor can read the inbox of the address they give the quiz: a six-digit code is emailed, they type
// it in, and the proof that comes back is what lets the quiz save their answers for that address.

async function call<T>(query: string, input: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${CONFIG.API_BASE}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { input } }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    const message: string = json.errors[0].message ?? '';
    // The shared request limiter words its refusal for sign-in; here it is about codes.
    if (/login attempts|too many requests|throttl/i.test(message)) throw new Error('Too many tries. Please wait a few minutes and try again.');
    throw new Error(message || 'Something went wrong. Please try again.');
  }
  return json.data as T;
}

export async function requestEmailCode(email: string): Promise<void> {
  await call(`mutation RequestEmailCode($input: RequestEmailCodeInput!) { requestEmailCode(input: $input) }`, { email });
}

/** Returns the proof to hand to createLead. */
export async function verifyEmailCode(email: string, code: string): Promise<string> {
  const data = await call<{ verifyEmailCode: string }>(
    `mutation VerifyEmailCode($input: VerifyEmailCodeInput!) { verifyEmailCode(input: $input) }`,
    { email, code },
  );
  return data.verifyEmailCode;
}
