'use client';

import { ApolloProvider } from '@apollo/client';
import { GlobalProgress } from '@telehealth/loading';
import { apolloClient } from '@/lib/apollo';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ApolloProvider client={apolloClient}>
      <GlobalProgress />
      {children}
    </ApolloProvider>
  );
}
