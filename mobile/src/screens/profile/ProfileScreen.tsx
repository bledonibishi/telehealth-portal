import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@apollo/client';
import Constants from 'expo-constants';
import { Card, Columns, Pill, Screen } from '../../components/ui';
import { MenuRow } from '../../components/MenuRow';
import { MY_PROFILE } from '../../graphql/profile';
import { signOut } from '../../lib/session';
import { colors } from '../../theme';

/** The menu behind the round button at the top of the main screens: who is signed in, and every setting the patient can change. */
export function ProfileScreen({ navigation }: any) {
  const { data, refetch } = useQuery(MY_PROFILE, { fetchPolicy: 'cache-and-network' });
  const p = data?.myProfile;
  React.useEffect(() => navigation.addListener('focus', () => { refetch(); }), [navigation, refetch]);

  return (
    <Screen title="Profile & settings" subtitle="Your details, sign-in and notifications.">
      <Card style={s.who}>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{p ? `${p.firstName} ${p.lastName}` : ' '}</Text>
          <Text style={s.email}>{p?.email ?? ' '}</Text>
        </View>
        {!!p?.patientNumber && <Pill label={p.patientNumber} />}
      </Card>
      <Columns>
        <Card style={{ padding: 6 }}>
          <MenuRow icon="👤" label="Personal details" hint="Phone, height, allergies, emergency contact" onPress={() => navigation.navigate('ProfileDetails')} />
          <MenuRow icon="✉️" label="Email address" hint="Change the email you sign in with" onPress={() => navigation.navigate('ChangeEmail')} />
          <MenuRow icon="🔑" label="Password" hint="Choose a new password" onPress={() => navigation.navigate('ChangePassword')} />
          <MenuRow icon="🔔" label="Notification settings" hint="What reaches your phone and your inbox" onPress={() => navigation.navigate('NotificationSettings')} />
        </Card>
        <Card style={{ padding: 6 }}>
          <MenuRow icon="💬" label="Help & messages" hint="Write to your care team" onPress={() => navigation.navigate('Main', { screen: 'Messages' })} />
          <MenuRow icon="💳" label="Stop or refund" hint="Stop future payments or ask for a refund" onPress={() => navigation.navigate('Main', { screen: 'More', params: { screen: 'Account' } })} />
          <MenuRow icon="🚪" label="Sign out" hint="You’ll need to sign in again" onPress={signOut} />
        </Card>
      </Columns>
      <Text style={s.version}>Version {Constants.expoConfig?.version ?? '—'}</Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  name: { fontSize: 18, fontWeight: '800', color: colors.ink900 },
  email: { fontSize: 13, color: colors.slate500, marginTop: 2 },
  version: { fontSize: 12, color: colors.slate400, textAlign: 'center', marginTop: 20 },
});
