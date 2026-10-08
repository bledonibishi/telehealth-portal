import React, { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { CANCEL_MY_SUBSCRIPTION, MY_OPEN_REFUND_REQUEST, REQUEST_MY_REFUND } from '../../graphql/operations';
import { Button, Card, CardTitle, Columns, ErrorText, Notice, Screen } from '../../components/ui';
import { colors } from '../../theme';

/**
 * Two separate asks, kept apart on purpose: stopping stops the next payment (nothing paid is returned); a refund
 * request is a question to the clinic, answered by a person who can see whether the medicine has already left the pharmacy.
 */
export function AccountScreen({ navigation }: any) {
  const { data, refetch } = useQuery(MY_OPEN_REFUND_REQUEST, { fetchPolicy: 'network-only' });
  const [requestRefund, { loading: asking, error: askError }] = useMutation(REQUEST_MY_REFUND);
  const [stop, { loading: stopping, error: stopError }] = useMutation(CANCEL_MY_SUBSCRIPTION);
  const [stopped, setStopped] = useState('');
  const open = data?.myOpenRefundRequest;

  React.useEffect(() => navigation.addListener('focus', () => { refetch(); }), [navigation, refetch]);

  const confirmStop = () =>
    Alert.alert('Stop my subscription?', 'No further payments are taken after the period you have already paid for. Nothing you have paid is returned.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Yes, stop it', style: 'destructive', onPress: () => stop().then((r) => setStopped(r.data?.cancelMySubscription ?? 'Done')).catch(() => undefined) },
    ]);

  const confirmRefund = () =>
    Alert.alert('Ask for a refund?', 'You don’t need to give a reason. The clinic looks at where your order is and replies; nothing is refunded until it does.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send request', onPress: () => requestRefund().then(() => refetch()).catch(() => undefined) },
    ]);

  return (
    <Screen title="Stop or refund" subtitle="Stop future payments, or ask the clinic for your money back.">
      <Columns>
        <Card>
          <CardTitle title="Stop my subscription" />
          <Text style={styles.text}>No further payments are taken after the period you have already paid for. Nothing you have paid is returned.</Text>
          {stopped ? <Notice tone="good">{stopped}</Notice> : <Button label="Stop my subscription" variant="outline" onPress={confirmStop} loading={stopping} style={styles.button} />}
          <ErrorText>{stopError?.message}</ErrorText>
        </Card>
        <Card>
          <CardTitle title="Ask for a refund" />
          <Text style={styles.text}>You don’t need to give a reason. The clinic looks at where your order is and replies; nothing is refunded until it does.</Text>
          {open ? <Notice tone="info">Your request is with the clinic. We’ll be in touch.</Notice> : <Button label="Ask for a refund" variant="outline" onPress={confirmRefund} loading={asking} style={styles.button} />}
          <ErrorText>{askError?.message}</ErrorText>
        </Card>
      </Columns>
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 13, color: colors.slate600, lineHeight: 19, marginTop: 4 },
  button: { alignSelf: 'flex-start', marginTop: 12 },
});
