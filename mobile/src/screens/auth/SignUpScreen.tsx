import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform, KeyboardAvoidingView,
} from 'react-native';

export function SignUpScreen({ navigation }: any) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '', dateOfBirth: '',
  });

  const set = (key: string) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Create account</Text>
        <TextInput style={styles.input} placeholder="First name" value={form.firstName} onChangeText={set('firstName')} />
        <TextInput style={styles.input} placeholder="Last name" value={form.lastName} onChangeText={set('lastName')} />
        <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={set('email')} />
        <TextInput style={styles.input} placeholder="Password" secureTextEntry value={form.password} onChangeText={set('password')} />
        <TextInput style={styles.input} placeholder="Date of birth (YYYY-MM-DD)" value={form.dateOfBirth} onChangeText={set('dateOfBirth')} />
        <TouchableOpacity style={styles.button} onPress={() => { /* TODO: call registerPatient mutation */ }}>
          <Text style={styles.buttonText}>Create account</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.link}>Already have an account? Sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: '#f9fafb', flexGrow: 1, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '600', color: '#111827', marginBottom: 20 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, fontSize: 15, backgroundColor: '#fff' },
  button: { backgroundColor: '#0ea5e9', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  link: { textAlign: 'center', color: '#0ea5e9', fontSize: 14, marginTop: 16 },
});
