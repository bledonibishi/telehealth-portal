import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation } from '@apollo/client';
import { Button, Card, CardTitle, ErrorText, Notice, Screen } from '../../components/ui';
import { PasswordField } from '../../components/PasswordField';
import { CHANGE_MY_PASSWORD } from '../../graphql/profile';
import { setTokens } from '../../lib/tokens';
import { colors } from '../../theme';

/** The current password is asked for, so a phone left unlocked can't be used to lock the owner out. Other devices are signed out. */
export function ChangePasswordScreen({ navigation }: any) {
  const [change, { loading }] = useMutation(CHANGE_MY_PASSWORD);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [problem, setProblem] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  const mismatch = !!again && again !== next;
  const ready = !!current && next.length >= 8 && next === again;

  const submit = async () => {
    setProblem(null);
    try {
      const res = await change({ variables: { currentPassword: current, newPassword: next } });
      const tokens = res.data?.changeMyPassword;
      // This phone carries on with fresh tokens; every other session has just been ended.
      if (tokens) await setTokens(tokens.accessToken, tokens.refreshToken);
      setCurrent(''); setNext(''); setAgain('');
      setDone(true);
    } catch (e) {
      setProblem(e);
    }
  };

  return (
    <Screen title="Change password" subtitle="You’ll stay signed in here; other devices are signed out.">
      <Card>
        <CardTitle title="Your password" />
        <View style={s.fields}>
          <PasswordField value={current} onChangeText={setCurrent} placeholder="Current password" textContentType="password" autoComplete="current-password" />
          <PasswordField value={next} onChangeText={setNext} placeholder="New password (at least 8 characters)" textContentType="newPassword" autoComplete="new-password" />
          <PasswordField value={again} onChangeText={setAgain} placeholder="New password again" textContentType="newPassword" autoComplete="new-password" />
        </View>
        {mismatch && <Text style={s.mismatch}>The two new passwords don’t match.</Text>}
        {done && <Notice tone="good">Your password was changed.</Notice>}
        <ErrorText error={problem} />
        <Button label="Change password" onPress={submit} loading={loading} disabled={!ready} style={{ marginTop: 12 }} />
        {done && <Button label="Done" variant="outline" onPress={() => navigation.goBack()} style={{ marginTop: 8 }} />}
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  fields: { gap: 10, marginTop: 8 },
  mismatch: { fontSize: 12, color: colors.slate500, marginTop: 8 },
});
