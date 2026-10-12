/**
 * Checks that createLoadingLink counts what it should and nothing else: every query and mutation, balanced on success,
 * failure and cancel, and never a subscription (which stays open) or a call marked silent.
 *   pnpm --filter @telehealth/loading check
 */
import { ApolloLink, Observable, execute, gql } from '@apollo/client';
import { createLoadingLink } from '../src/apollo';
import { progress } from '../src/progress';

let begun = 0;
let ended = 0;
const begin = progress.beginRequest;
const end = progress.endRequest;
progress.beginRequest = () => { begun++; begin(); };
progress.endRequest = () => { ended++; end(); };

const query = gql`query Q { a }`;
const mutation = gql`mutation M { b }`;
const subscription = gql`subscription S { c }`;

const ok = new ApolloLink(() => new Observable((o) => { setTimeout(() => { o.next({ data: {} }); o.complete(); }, 5); }));
const bad = new ApolloLink(() => new Observable((o) => { setTimeout(() => o.error(new Error('boom')), 5); }));
const open = new ApolloLink(() => new Observable(() => {})); // never completes, like a websocket subscription

function run(doc: typeof query, terminal: ApolloLink, context: Record<string, unknown> = {}, cancel = false) {
  return new Promise<void>((resolve) => {
    const sub = execute(createLoadingLink().concat(terminal), { query: doc, context }).subscribe({ next: () => {}, error: () => resolve(), complete: () => resolve() });
    if (cancel) { sub.unsubscribe(); resolve(); }
  });
}

const cases: Array<[string, () => Promise<void>, number]> = [
  ['query succeeds', () => run(query, ok), 1],
  ['mutation succeeds', () => run(mutation, ok), 1],
  ['query fails', () => run(query, bad), 1],
  ['query cancelled', () => run(query, open, {}, true), 1],
  ['marked silent', () => run(query, ok, { silentLoading: true }), 0],
  ['subscription (stays open)', () => { void run(subscription, open); return Promise.resolve(); }, 0],
];

(async () => {
  let failed = false;
  for (const [name, work, counted] of cases) {
    begun = ended = 0;
    await work();
    await new Promise((r) => setTimeout(r, 20));
    const good = begun === counted && ended === counted;
    failed ||= !good;
    console.log(`${good ? 'ok  ' : 'FAIL'} ${name}: counted ${begun}, ended ${ended} (expected ${counted})`);
  }
  process.exit(failed ? 1 : 0);
})();
