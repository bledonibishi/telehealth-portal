import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { Button, Card, CardTitle, ErrorText, Field, Notice, Screen } from '../../components/ui';
import { PasswordField } from '../../components/PasswordField';
import { CONFIRM_MY_EMAIL_CHANGE, MY_PROFILE, REQUEST_MY_EMAIL_CHANGE } from '../../graphql/profile';
import { describeError, ErrorCode } from '@telehealth/shared-types';
import { apolloClient } from '../../lib/apollo';
import { LOGIN_PATIENT } from '../../graphql/operations';
import { setTokens } from '../../lib/tokens';
import { colors } from '../../theme';

/**
 * Two steps, because the email is how an account is reached: the password proves it is the owner, and a code sent to the
 * NEW address proves the inbox is theirs. The old address is told afterwards and other devices are signed out.
 */
export function ChangeEmailScreen({ navigation }: any) {
  const { data, refetch } = useQuery(MY_PROFILE, { fetchPolicy: 'cache-and-network' });
  const [request, { loading: sending }] = useMutation(REQUEST_MY_EMAIL_CHANGE);
  const [confirm, { loading: confirming }] = useMutation(CONFIRM_MY_EMAIL_CHANGE);
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'form' | 'code' | 'done'>('form');
  const [problem, setProblem] = useState<unknown>(null);

  const send = async () => {
    setProblem(null);
    try {
      await request({ variables: { newEmail: newEmail.trim(), currentPassword: password } });
      setStep('code');
    } catch (e) {
      setProblem(e);
    }
  };

  const verify = async () => {
    setProblem(null);
    try {
      const res = await confirm({ variables: { newEmail: newEmail.trim(), code: code.trim(), currentPassword: password } });
      const tokens = res.data?.confirmMyEmailChange;
      if (tokens) await setTokens(tokens.accessToken, tokens.refreshToken);
      setPassword('');
      setStep('done');
      refetch().catch(() => undefined);
    } catch (e) {
      // A wrong code is just that. Anything else (a dropped connection, a refused session) may mean the change went through
      // and only the reply was lost: signing in with the new address and the password just given settles it.
      const code = describeError(e)?.code;
      if (code !== ErrorCode.BAD_REQUEST && code !== ErrorCode.RATE_LIMITED && (await recoverSession())) return;
      setProblem(e);
    }
  };

  const recoverSession = async () => {
    try {
      const res = await apolloClient.mutate({ mutation: LOGIN_PATIENT, variables: { input: { email: newEmail.trim().toLowerCase(), password } } });
      const tokens = res.data?.loginPatient;
      if (!tokens) return false;
      await setTokens(tokens.accessToken, tokens.refreshToken);
      setPassword('');
      setStep('done');
      refetch().catch(() => undefined);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <Screen title="Email address" subtitle="The email you sign in with and where we write to you.">
      <Card>
        <Text style={s.label}>Current email</Text>
        <Text style={s.current}>{data?.myProfile?.email ?? ' '}</Text>
      </Card>
      <View style={{ height: 14 }} />
      {step === 'form' && (
        <Card>
          <CardTitle title="New email" subtitle="We’ll send a 6-digit code to the new address to check it’s yours." />
          <View style={s.fields}>
            <Field label="New email address" value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" />
            <PasswordField value={password} onChangeText={setPassword} placeholder="Your current password" textContentType="password" autoComplete="current-password" />
          </View>
          <ErrorText error={problem} />
          <Button label="Send me a code" onPress={send} loading={sending} disabled={!newEmail.includes('@') || !password} style={{ marginTop: 12 }} />
        </Card>
      )}
      {step === 'code' && (
        <Card>
          <CardTitle title="Enter the code" subtitle={`We sent a 6-digit code to ${newEmail.trim()}. It works for 10 minutes.`} />
          <View style={s.fields}>
            <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" />
          </View>
          <ErrorText error={problem} />
          <Button label="Change my email" onPress={verify} loading={confirming} disabled={code.trim().length < 6} style={{ marginTop: 12 }} />
          <Button label="Use a different address" variant="outline" onPress={() => { setStep('form'); setCode(''); setProblem(null); }} style={{ marginTop: 8 }} />
        </Card>
      )}
      {step === 'done' && (
        <Card>
          <Notice tone="good" title="Your email was changed">
            Use {newEmail.trim().toLowerCase()} the next time you sign in. We’ve let your old address know, and other devices were signed out.
          </Notice>
          <Button label="Done" onPress={() => navigation.goBack()} style={{ marginTop: 12 }} />
        </Card>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 12, color: colors.slate500 },
  current: { fontSize: 16, fontWeight: '700', color: colors.ink900, marginTop: 2 },
  fields: { gap: 10, marginTop: 8 },
});
