'use client';
import { ApolloLink, Observable } from '@apollo/client';
import { progress } from './progress';

/**
 * Put this first in an Apollo link chain and every GraphQL call is counted for the top bar:
 *
 *   link: createLoadingLink().concat(restOfTheChain)
 *
 * To keep one call off the bar (a background refresh the reader did not ask for), pass `context: { silentLoading: true }`
 * to that `useQuery` or `useMutation`.
 */
export function createLoadingLink() {
  return new ApolloLink((operation, forward) => {
    if (operation.getContext().silentLoading) return forward(operation);
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
