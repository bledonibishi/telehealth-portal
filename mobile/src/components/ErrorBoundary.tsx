import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ERRORS, ErrorCode } from '@telehealth/shared-types';
import { colors } from '../theme';
import { Button, Notice } from './ui';

/** What the patient sees when a screen crashed: the generic message (a crash's own text is for the logs) and a way on. */
export function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <SafeAreaView style={s.page}>
      <View style={s.body}>
        <Text style={s.title} accessibilityRole="header">Something went wrong</Text>
        <Notice tone="danger">{ERRORS[ErrorCode.INTERNAL].message}</Notice>
        <Button label="Try again" onPress={onRetry} />
      </View>
    </SafeAreaView>
  );
}

/** Catches a render crash anywhere below it, so the app shows ErrorScreen instead of closing. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    return this.state.failed ? <ErrorScreen onRetry={() => this.setState({ failed: false })} /> : this.props.children;
  }
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  body: { flex: 1, justifyContent: 'center', padding: 24, gap: 4 },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink900, marginBottom: 12 },
});
