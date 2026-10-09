import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useMutation } from '@apollo/client';
import { BrandAnimation } from '../../components/BrandAnimation';
import { REQUEST_PASSWORD_RESET } from '../../graphql/operations';
import { ErrorText } from '../../components/ui';

export function ForgotPasswordScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [request, { loading, data }] = useMutation(REQUEST_PASSWORD_RESET, { onError: (e) => setError(e) });
  const sent = !!data?.requestPatientPasswordReset;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <BrandAnimation height={90} showCaption={false} />
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Forgot your password?</Text>
        {sent ? (
          <>
            <Text style={styles.body}>
              If an account exists for {email.trim()}, we've emailed a link to choose a new password. It works once and expires in 60 minutes. Open it on this phone and finish in the browser.
            </Text>
            <Text style={styles.hint}>Nothing arrived? Check your spam folder, or try again in a few minutes.</Text>
          </>
        ) : (
          <>
            <Text style={styles.body}>Enter your email and we'll send you a link to choose a new one.</Text>
            <ErrorText error={error} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TouchableOpacity
              style={[styles.button, (loading || !email.trim()) && styles.buttonDisabled]}
              disabled={loading || !email.trim()}
              onPress={() => { setError(null); request({ variables: { input: { email: email.trim() } } }); }}
            >
              <Text style={styles.buttonText}>{loading ? 'Sending…' : 'Send reset link'}</Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.link}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', justifyContent: 'center', padding: 24, width: '100%', alignSelf: 'center', maxWidth: 480 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 24, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
  title: { fontSize: 22, fontWeight: '600', color: '#111827', marginBottom: 12 },
  body: { fontSize: 14, color: '#4b5563', lineHeight: 20, marginBottom: 16 },
  hint: { fontSize: 12, color: '#9ca3af' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, fontSize: 15 },
  button: { backgroundColor: '#0ea5e9', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  error: { color: '#f43f5e', fontSize: 13, marginBottom: 12 },
  link: { textAlign: 'center', color: '#0ea5e9', fontSize: 14, marginTop: 16 },
});
