'use client';

import { ApolloProvider } from '@apollo/client';
import { GlobalProgress } from '@telehealth/loading';
import { apolloClient } from '@/lib/apollo';
import { I18nProvider } from '@/lib/i18n/I18nProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ApolloProvider client={apolloClient}>
        <GlobalProgress />
        {children}
      </ApolloProvider>
    </I18nProvider>
  );
}
