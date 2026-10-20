import { CONFIG } from './config';

// Someone who did the quiz before and never paid, and has now proved the address is theirs: what they answered then, so
// the quiz can set it beside today's answers and let them choose which to go on with.

export interface PreviousAnswer { questionId: string; question: string; answer: string }
export interface PreviousAssessment {
  savedAt: string;
  healthSavedAt: string | null;
  eligibility: PreviousAnswer[];
  health: PreviousAnswer[];
  canKeep: boolean;
  keepBlockedReason: string | null;
}

async function gql<T>(query: string, input: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${CONFIG.API_BASE}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { input } }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message ?? 'Something went wrong. Please try again.');
  return json.data as T;
}

/** Null when there is nothing earlier to compare with. Never blocks the quiz: any failure reads as "nothing earlier". */
export async function fetchPrevious(product: string, email: string, token: string): Promise<PreviousAssessment | null> {
  try {
    const data = await gql<{ previousAssessment: PreviousAssessment | null }>(
      `query Previous($input: PreviousAssessmentInput!) { previousAssessment(input: $input) {
        savedAt healthSavedAt canKeep keepBlockedReason
        eligibility { questionId question answer }
        health { questionId question answer }
      } }`,
      { email, productKind: product, emailVerificationToken: token },
    );
    return data.previousAssessment;
  } catch {
    return null;
  }
}

/** Goes on with the earlier answers. Throws with a message for the visitor when it can't. */
export async function resumeEarlier(product: string, email: string, token: string): Promise<{ id: string; riskTag: 'RED' | 'ORANGE' | 'GREEN'; riskReasons: string[] }> {
  const data = await gql<{ resumeLead: { id: string; riskTag: 'RED' | 'ORANGE' | 'GREEN'; riskReasons: string[] } }>(
    `mutation Resume($input: PreviousAssessmentInput!) { resumeLead(input: $input) { id riskTag riskReasons } }`,
    { email, productKind: product, emailVerificationToken: token },
  );
  return data.resumeLead;
}

export interface CompareRow { id: string; question: string; earlier: string | null; today: string | null; changed: boolean }

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** Earlier and today's answers side by side, by question; a question answered on only one side counts as changed. */
export function compareAnswers(earlier: PreviousAnswer[], today: PreviousAnswer[]): CompareRow[] {
  const rows = new Map<string, CompareRow>();
  for (const a of earlier) rows.set(a.questionId, { id: a.questionId, question: a.question, earlier: a.answer, today: null, changed: true });
  for (const a of today) {
    const row = rows.get(a.questionId);
    if (row) row.today = a.answer;
    else rows.set(a.questionId, { id: a.questionId, question: a.question, earlier: null, today: a.answer, changed: true });
  }
  const list = Array.from(rows.values());
  for (const r of list) r.changed = norm(r.earlier) !== norm(r.today);
  return list;
}

export interface ReturnOffer { until: string; treatment: string | null; clientSecret: string | null; totalCents: number | null; unusedVoucherCents: number; payUrl: string | null; amountCents: number | null; currency: string | null }

/**
 * A patient refunded on their first order whose prescription is still valid: where to pay for the medicine alone. Null when
 * there is no such offer. Never blocks the quiz: any failure reads as "no offer".
 */
export async function fetchReturnOffer(product: string, email: string, token: string): Promise<ReturnOffer | null> {
  try {
    const data = await gql<{ returnOffer: ReturnOffer | null }>(
      `query ReturnOffer($input: PreviousAssessmentInput!) { returnOffer(input: $input) { until treatment clientSecret totalCents unusedVoucherCents payUrl amountCents currency } }`,
      { email, productKind: product, emailVerificationToken: token },
    );
    return data.returnOffer;
  } catch {
    return null;
  }
}

const OFFER_KEY = 'th_return_offer';

/** What the payment page needs, kept in this tab only: the offer, and the email proof to ask for the subscription with. */
export interface SavedReturn { offer: ReturnOffer; email: string; token: string }

export function saveReturnOffer(saved: SavedReturn) {
  try { sessionStorage.setItem(OFFER_KEY, JSON.stringify(saved)); } catch {}
}

export function loadReturnOffer(): SavedReturn | null {
  try { return JSON.parse(sessionStorage.getItem(OFFER_KEY) ?? 'null'); } catch { return null; }
}

export interface ReturnSubscription { clientSecret: string; amountDueCents: number; totalCents: number; currency: string }

/** The first month of the subscription, to be paid on our page. Throws with a message for the visitor when it can't be had. */
export async function startReturnSubscription(email: string, token: string): Promise<ReturnSubscription> {
  const data = await gql<{ returnSubscription: ReturnSubscription | null }>(
    `mutation ReturnSub($input: PreviousAssessmentInput!) { returnSubscription(input: $input) { clientSecret amountDueCents totalCents currency } }`,
    { email, productKind: 'HRT', emailVerificationToken: token },
  );
  if (!data.returnSubscription) throw new Error('We couldn’t start the subscription. You can pay once instead.');
  return data.returnSubscription;
}
