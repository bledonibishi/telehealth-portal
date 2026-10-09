import React, { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, View, ActivityIndicator } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { ME_BASIC_INFO, UPDATE_MY_BASIC_INFO } from '../../graphql/operations';
import { ErrorText } from '../../components/ui';

type Form = Record<'firstName' | 'lastName' | 'dateOfBirth' | 'phone' | 'addressLine1' | 'addressLine2' | 'city' | 'postcode' | 'country', string>;

const EMPTY: Form = { firstName: '', lastName: '', dateOfBirth: '', phone: '', addressLine1: '', addressLine2: '', city: '', postcode: '', country: 'Kosovo' };
const FIELDS: { key: keyof Form; label: string; hint?: string; optional?: boolean; keyboard?: 'phone-pad' | 'numbers-and-punctuation' }[] = [
  { key: 'phone', label: 'Phone number', hint: 'The courier may call you — medicines need a signature', keyboard: 'phone-pad' },
  { key: 'addressLine1', label: 'Address' },
  { key: 'addressLine2', label: 'Apartment, floor (optional)', optional: true },
  { key: 'city', label: 'City' },
  { key: 'postcode', label: 'Postcode' },
  { key: 'country', label: 'Country' },
];

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v) <= new Date();

/** Same step as the web portal: confirm your details, and say where to send the treatment. */
export function BasicInformationScreen({ navigation }: any) {
  const { data, loading } = useQuery(ME_BASIC_INFO, { fetchPolicy: 'network-only' });
  const [form, setForm] = useState<Form>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [save, { loading: saving }] = useMutation(UPDATE_MY_BASIC_INFO, {
    refetchQueries: [{ query: ME_BASIC_INFO }],
    onCompleted: () => navigation.goBack(),
    onError: (e) => setError(e),
  });

  // Pre-filled with what we already know; the patient confirms or corrects it.
  useEffect(() => {
    const me = data?.me;
    if (touched || !me) return;
    setForm({
      firstName: me.firstName ?? '', lastName: me.lastName ?? '', dateOfBirth: me.dateOfBirth ? String(me.dateOfBirth).slice(0, 10) : '',
      phone: me.phone ?? '', addressLine1: me.addressLine1 ?? '', addressLine2: me.addressLine2 ?? '',
      city: me.city ?? '', postcode: me.postcode ?? '', country: me.country ?? 'Kosovo',
    });
  }, [data?.me, touched]);

  const set = (key: keyof Form) => (value: string) => {
    setTouched(true);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const complete =
    !!form.firstName.trim() && !!form.lastName.trim() && isDate(form.dateOfBirth) &&
    FIELDS.every((f) => f.optional || form[f.key].trim());

  const submit = () => {
    if (!complete) return;
    setError(null);
    save({
      variables: {
        input: {
          firstName: form.firstName.trim(), lastName: form.lastName.trim(), dateOfBirth: form.dateOfBirth,
          phone: form.phone.trim(), addressLine1: form.addressLine1.trim(), addressLine2: form.addressLine2.trim() || null,
          city: form.city.trim(), postcode: form.postcode.trim(), country: form.country.trim(),
        },
      },
    });
  };

  if (loading && !data) return <ActivityIndicator style={{ flex: 1 }} />;

  const input = (key: keyof Form, label: string, extra: object = {}, hint?: string) => (
    <View key={key} style={{ marginTop: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={form[key]} onChangeText={set(key)} {...extra} />
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Your details</Text>
        <Text style={styles.subtitle}>Check your details so we identify you correctly and send your order to the right place.</Text>

        <View style={styles.card}>
          <Text style={styles.section}>Personal details</Text>
          {input('firstName', 'First name')}
          {input('lastName', 'Last name')}
          {input('dateOfBirth', 'Date of birth (YYYY-MM-DD)', { keyboardType: 'numbers-and-punctuation', maxLength: 10, placeholder: '1990-04-23' })}
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Delivery address</Text>
          {FIELDS.map((f) => input(f.key, f.label, f.keyboard ? { keyboardType: f.keyboard } : {}, f.hint))}
        </View>

        <ErrorText error={error} />

        <TouchableOpacity style={[styles.cta, (!complete || saving) && styles.ctaDisabled]} disabled={!complete || saving} onPress={submit}>
          <Text style={styles.ctaText}>{saving ? 'Saving…' : 'Save and continue'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 8, lineHeight: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6', padding: 16, marginTop: 18 },
  section: { fontSize: 12, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },
  label: { fontSize: 14, fontWeight: '500', color: '#111827', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: '#fff' },
  hint: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  error: { color: '#be123c', backgroundColor: '#fff1f2', borderRadius: 12, padding: 10, fontSize: 13, marginTop: 16 },
  cta: { backgroundColor: '#0ea5e9', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
