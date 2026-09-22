import React from 'react';
import { ApolloProvider } from '@apollo/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { apolloClient } from './lib/apollo';
import { AppNavigator } from './navigation';

export default function App() {
  return (
    <ApolloProvider client={apolloClient}>
      <SafeAreaProvider>
        <AppNavigator />
      </SafeAreaProvider>
    </ApolloProvider>
  );
}
