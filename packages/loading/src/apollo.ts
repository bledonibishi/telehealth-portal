'use client';
import { ApolloLink, Observable } from '@apollo/client';
import { getMainDefinition } from '@apollo/client/utilities';
import { progress } from './progress';

/**
 * Put this first in an Apollo link chain and every GraphQL call is counted for the top bar:
 *
 *   link: createLoadingLink().concat(restOfTheChain)
 *
 * Subscriptions are never counted: they stay open for as long as a screen listens (a chat), so counting them would leave
 * the bar on. To keep one more call off the bar (a background refresh the reader did not ask for), pass
 * `context: { silentLoading: true }` to that `useQuery` or `useMutation`.
 */
export function createLoadingLink() {
  return new ApolloLink((operation, forward) => {
    const definition = getMainDefinition(operation.query);
    const isSubscription = definition.kind === 'OperationDefinition' && definition.operation === 'subscription';
    if (isSubscription || operation.getContext().silentLoading) return forward(operation);
    return new Observable((observer) => {
      let ended = false;
      const end = () => {
        if (!ended) {
          ended = true;
          progress.endRequest();
        }
      };
      progress.beginRequest();
      const sub = forward(operation).subscribe({
        next: (value) => observer.next(value),
        error: (err) => { end(); observer.error(err); },
        complete: () => { end(); observer.complete(); },
      });
      return () => { sub.unsubscribe(); end(); };
    });
  });
}
