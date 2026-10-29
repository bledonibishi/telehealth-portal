import React from 'react';
import { ApolloProvider } from '@apollo/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { apolloClient } from './lib/apollo';
import { AppNavigator } from './navigation';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GuideProvider } from './components/guide/GuideProvider';
import { WELCOME_TOUR } from './lib/guideTours';

export default function App() {
  return (
    <ApolloProvider client={apolloClient}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <GuideProvider welcome={WELCOME_TOUR}>
            <AppNavigator />
          </GuideProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </ApolloProvider>
  );
}
