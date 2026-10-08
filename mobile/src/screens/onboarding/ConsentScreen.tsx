import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { ACCEPT_TELEHEALTH_CONSENT, CONSENT_TEXT, MY_TELEHEALTH_CONSENT } from '../../graphql/operations';

/** For a patient an admin set up: the telehealth consent, accepted by the patient themselves. */
export function ConsentScreen({ navigation }: any) {
  const { data, loading } = useQuery(CONSENT_TEXT, { variables: { type: 'TELEHEALTH' } });
  const consent = data?.consentText;
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [accept, { loading: saving }] = useMutation(ACCEPT_TELEHEALTH_CONSENT, {
    refetchQueries: [{ query: MY_TELEHEALTH_CONSENT }],
    awaitRefetchQueries: true,
    onCompleted: () => navigation.goBack(),
    onError: (e) => setError(e.message),
  });

  if (loading) return <View style={styles.container}><ActivityIndicator /></View>;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Before we start</Text>
      <Text style={styles.sub}>Please read how your online consultation works.</Text>
      {consent?.text.split('\n').map((line: string) => (
        <Text key={line} style={styles.line}>• {line}</Text>
      ))}
      <TouchableOpacity style={styles.agree} onPress={() => setAgreed((a) => !a)} accessibilityRole="checkbox" accessibilityState={{ checked: agreed }}>
        <View style={[styles.box, agreed && styles.boxOn]}>{agreed && <Text style={styles.tick}>✓</Text>}</View>
        <Text style={styles.agreeText}>I understand and agree</Text>
      </TouchableOpacity>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity
        style={[styles.next, (!consent || !agreed || saving) && styles.disabled]}
        disabled={!consent || !agreed || saving}
        onPress={() => { setError(''); accept({ variables: { version: consent.version } }); }}
      >
        <Text style={styles.nextText}>{saving ? 'Saving…' : 'Continue'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: '#f9fafb', width: '100%', alignSelf: 'center', maxWidth: 720 },
  title: { fontSize: 20, fontWeight: '600', color: '#111827', marginBottom: 8, lineHeight: 28 },
  sub: { fontSize: 15, color: '#6b7280', marginBottom: 20 },
  line: { fontSize: 14, color: '#374151', marginBottom: 10, lineHeight: 20 },
  agree: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: '#9ca3af', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  boxOn: { backgroundColor: '#0d9488', borderColor: '#0d9488' },
  tick: { color: '#fff', fontSize: 15, fontWeight: '700' },
  agreeText: { fontSize: 15, color: '#111827' },
  error: { color: '#b91c1c', fontSize: 14, marginBottom: 12 },
  next: { backgroundColor: '#0d9488', borderRadius: 10, padding: 16, alignItems: 'center' },
  nextText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
