import React, { useState } from 'react';
import { BrandAnimation } from '../../components/BrandAnimation';
import { PasswordField } from '../../components/PasswordField';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useMutation } from '@apollo/client';
import { LOGIN_PATIENT } from '../../graphql/operations';
import { MY_ONBOARDING } from '../../graphql/onboarding';
import { apolloClient } from '../../lib/apollo';
import { setTokens } from '../../lib/tokens';

export function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const [login, { loading }] = useMutation(LOGIN_PATIENT, {
    onCompleted: async ({ loginPatient }) => {
      await setTokens(loginPatient.accessToken, loginPatient.refreshToken);
      try {
        const { data } = await apolloClient.query({ query: MY_ONBOARDING, fetchPolicy: 'network-only' });
        navigation.replace(data?.myOnboarding?.status === 'APPROVED' ? 'Main' : 'Onboarding');
      } catch {
        // Onboarding status couldn't be checked — send them into the flow
        // that will re-check it, rather than assuming they're clear.
        navigation.replace('Onboarding');
      }
    },
    onError: (e) => setError(e.message),
  });

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.brand}>
        <Text style={styles.wordmark}>Omopharmacy</Text>
        <BrandAnimation />
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Welcome back</Text>
        {!!error && <Text style={styles.error}>{error}</Text>}
        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <PasswordField
          style={styles.input}
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={styles.forgot}>
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          disabled={loading}
          onPress={() => login({ variables: { input: { email, password } } })}
        >
          <Text style={styles.buttonText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
          <Text style={styles.link}>Don't have an account? Sign up</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', justifyContent: 'center', padding: 24, width: '100%', alignSelf: 'center', maxWidth: 480 },
  brand: { alignItems: 'center', marginBottom: 20 },
  wordmark: { fontSize: 26, fontWeight: '800', color: '#0f2352', letterSpacing: -0.3, marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 24, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
  title: { fontSize: 22, fontWeight: '600', color: '#111827', marginBottom: 20 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, fontSize: 15 },
  button: { backgroundColor: '#0ea5e9', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  error: { color: '#f43f5e', fontSize: 13, marginBottom: 12 },
  forgot: { alignSelf: 'flex-end', marginBottom: 8, marginTop: -4 },
  forgotText: { color: '#0ea5e9', fontSize: 13 },
  link: { textAlign: 'center', color: '#0ea5e9', fontSize: 14, marginTop: 16 },
});
