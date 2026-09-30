'use client';

import { ApolloProvider } from '@apollo/client';
import { apolloClient } from '@/lib/apollo';
import { I18nProvider } from '@/lib/i18n/I18nProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ApolloProvider client={apolloClient}>
      <I18nProvider>{children}</I18nProvider>
    </ApolloProvider>
  );
}
