import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { Button, Card, CardTitle, ErrorText, Field, Notice, Screen } from '../../components/ui';
import { MY_PROFILE, UPDATE_MY_PROFILE } from '../../graphql/profile';
import { colors } from '../../theme';

/** What the patient may edit themselves. Name and date of birth are checked against their ID, so they stay read-only. */
export function ProfileDetailsScreen() {
  const { data } = useQuery(MY_PROFILE, { fetchPolicy: 'cache-and-network' });
  const [save, { loading }] = useMutation(UPDATE_MY_PROFILE);
  const p = data?.myProfile;
  const [form, setForm] = useState({ phone: '', height: '', allergies: '', emergencyContactName: '', emergencyContactPhone: '' });
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);

  useEffect(() => {
    if (!p) return;
    setForm({ phone: p.phone ?? '', height: p.heightCm ? String(p.heightCm) : '', allergies: p.allergies ?? '', emergencyContactName: p.emergencyContactName ?? '', emergencyContactPhone: p.emergencyContactPhone ?? '' });
  }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key: keyof typeof form) => (value: string) => { setSaved(false); setForm((f) => ({ ...f, [key]: value })); };

  const submit = async () => {
    setProblem(null);
    const height = form.height.trim() ? Number(form.height.replace(',', '.')) : undefined;
    try {
      await save({ variables: { input: {
        // The phone can be changed but not emptied (deliveries need it), so a blank box leaves it as it is.
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        allergies: form.allergies.trim(),
        emergencyContactName: form.emergencyContactName.trim(),
        emergencyContactPhone: form.emergencyContactPhone.trim(),
        ...(height !== undefined && Number.isFinite(height) ? { heightCm: height } : {}),
      } } });
      setSaved(true);
    } catch (e) {
      setProblem(e);
    }
  };

  return (
    <Screen title="Personal details" subtitle="Keep these up to date so your care team can reach you.">
      <Card>
        <CardTitle title="On your account" />
        <Text style={s.fixed}>{p ? `${p.firstName} ${p.lastName}` : ' '}</Text>
        <Text style={s.hint}>To change your name or date of birth, write to us in Help & messages: we check these against your ID.</Text>
      </Card>
      <View style={{ height: 14 }} />
      <Card>
        <CardTitle title="Contact and health" />
        <View style={s.fields}>
          <Field label="Phone" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" textContentType="telephoneNumber" />
          <Field label="Height (cm)" value={form.height} onChangeText={set('height')} keyboardType="decimal-pad" />
          <Field label="Allergies" value={form.allergies} onChangeText={set('allergies')} hint="Anything your doctor should know about." multiline />
          <Field label="Emergency contact name" value={form.emergencyContactName} onChangeText={set('emergencyContactName')} />
          <Field label="Emergency contact phone" value={form.emergencyContactPhone} onChangeText={set('emergencyContactPhone')} keyboardType="phone-pad" />
        </View>
        {saved && <Notice tone="good">Saved.</Notice>}
        <ErrorText error={problem} />
        <Button label="Save" onPress={submit} loading={loading} disabled={!p} style={{ marginTop: 12 }} />
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  fixed: { fontSize: 15, fontWeight: '700', color: colors.ink900, marginTop: 4 },
  hint: { fontSize: 12, color: colors.slate500, marginTop: 4, lineHeight: 17 },
  fields: { gap: 12, marginTop: 8 },
});
