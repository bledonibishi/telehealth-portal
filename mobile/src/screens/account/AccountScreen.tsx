import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { CANCEL_MY_SUBSCRIPTION, MY_OPEN_REFUND_REQUEST, REQUEST_MY_REFUND } from '../../graphql/operations';
import { signOut } from '../../lib/session';
import { colors } from '../../theme';

/**
 * Two separate asks, kept apart on purpose: stopping stops the next payment (nothing paid is returned); a refund
 * request is a question to the clinic, answered by a person who can see whether the medicine has already left the pharmacy.
 */
export function AccountScreen({ navigation }: any) {
  const { data, refetch } = useQuery(MY_OPEN_REFUND_REQUEST, { fetchPolicy: 'network-only' });
  const [requestRefund, { loading: asking }] = useMutation(REQUEST_MY_REFUND);
  const [stop, { loading: stopping }] = useMutation(CANCEL_MY_SUBSCRIPTION);
  const [stopped, setStopped] = useState('');
  const open = data?.myOpenRefundRequest;

  React.useEffect(() => navigation.addListener('focus', () => { refetch(); }), [navigation, refetch]);

  const confirmStop = () =>
    Alert.alert('Stop my subscription?', 'No further payments are taken after the period you have already paid for. Nothing you have paid is returned.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Yes, stop it',
        style: 'destructive',
        onPress: async () => {
          try {
            const r = await stop();
            setStopped(r.data?.cancelMySubscription ?? 'Done');
          } catch (e) {
            Alert.alert('Could not stop it', (e as Error).message);
          }
        },
      },
    ]);

  const confirmRefund = () =>
    Alert.alert('Ask for a refund?', 'You don’t need to give a reason. The clinic looks at where your order is and replies; nothing is refunded until it does.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send request',
        onPress: async () => {
          try {
            await requestRefund();
            await refetch();
          } catch (e) {
            Alert.alert('Could not send it', (e as Error).message);
          }
        },
      },
    ]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Account</Text>

      <View style={styles.card}>
        <Text style={styles.heading}>Stop my subscription</Text>
        <Text style={styles.text}>No further payments are taken after the period you have already paid for. Nothing you have paid is returned.</Text>
        {stopped ? (
          <Text style={styles.ok}>{stopped}</Text>
        ) : (
          <TouchableOpacity style={styles.button} onPress={confirmStop} disabled={stopping}>
            {stopping ? <ActivityIndicator /> : <Text style={styles.buttonText}>Stop my subscription</Text>}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>Ask for a refund</Text>
        <Text style={styles.text}>You don’t need to give a reason. The clinic looks at where your order is and replies; nothing is refunded until it does.</Text>
        {open ? (
          <Text style={styles.note}>Your request is with the clinic. We’ll be in touch.</Text>
        ) : (
          <TouchableOpacity style={styles.button} onPress={confirmRefund} disabled={asking}>
            {asking ? <ActivityIndicator /> : <Text style={styles.buttonText}>Ask for a refund</Text>}
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity onPress={signOut} style={styles.signOutRow}><Text style={styles.signOut}>Sign out</Text></TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.page },
  content: { padding: 16, paddingTop: 56, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: '700', color: colors.slate900, marginBottom: 16 },
  card: { backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.slate200, padding: 16, marginBottom: 14 },
  heading: { fontSize: 15, fontWeight: '600', color: colors.slate800 },
  text: { fontSize: 13, color: colors.slate600, marginTop: 4, lineHeight: 19 },
  button: { marginTop: 12, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.slate200, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  buttonText: { fontSize: 13, fontWeight: '600', color: colors.slate700 },
  ok: { marginTop: 12, fontSize: 13, color: colors.brand700 },
  note: { marginTop: 12, fontSize: 13, color: colors.slate700 },
  signOutRow: { alignSelf: 'center', padding: 12 },
  signOut: { fontSize: 13, color: colors.slate500 },
});
