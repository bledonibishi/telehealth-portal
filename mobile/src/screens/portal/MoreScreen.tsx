import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@apollo/client';
import { MY_PRODUCT_KIND } from '../../graphql/portal';
import { Card, Columns, Screen } from '../../components/ui';
import { signOut } from '../../lib/session';
import { colors } from '../../theme';

function Row({ icon, label, hint, onPress }: { icon: string; label: string; hint: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
      <View style={styles.icon}><Text style={{ fontSize: 20 }}>{icon}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

/** Everything that isn't a tab: the doctor, orders and payments, side effects, reports, a new consultation. */
export function MoreScreen({ navigation }: any) {
  const { data } = useQuery(MY_PRODUCT_KIND, { fetchPolicy: 'cache-first' });
  const glp1 = data?.myProductKind === 'GLP1';
  return (
    <Screen title="More" subtitle="Your treatment, orders and account.">
      <Columns>
        <Card style={{ padding: 6 }}>
          <Row icon="🩺" label="My Doctor" hint="Your care team, hours and recent appointments" onPress={() => navigation.navigate('Doctor')} />
          <Row icon="📦" label="Orders & payments" hint="Deliveries, tracking, invoices" onPress={() => navigation.navigate('Orders')} />
          <Row icon="💳" label="Stop or refund" hint="Stop future payments or ask for your money back" onPress={() => navigation.navigate('Account')} />
          <Row icon="🤒" label="Side effects" hint={glp1 ? 'Your weekly check and what you’ve reported' : 'What you’ve reported to your doctor'} onPress={() => navigation.navigate('SideEffects')} />
          {glp1 && <Row icon="📄" label="Check-in reports" hint="A PDF after each check-in" onPress={() => navigation.navigate('Reports')} />}
        </Card>
        <Card style={{ padding: 6 }}>
          <Row icon="📝" label="New consultation" hint="Start a medical questionnaire" onPress={() => navigation.navigate('NewConsultation')} />
          {__DEV__ && <Row icon="🧩" label="Component library" hint="Developers only: Storybook" onPress={() => navigation.navigate('Storybook')} />}
          <Row icon="🚪" label="Sign out" hint="You’ll need to sign in again" onPress={signOut} />
        </Card>
      </Columns>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  icon: { width: 44, height: 44, borderRadius: 13, backgroundColor: colors.ink50, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontWeight: '700', color: colors.ink900 },
  hint: { fontSize: 12, color: colors.slate500, marginTop: 1 },
  chevron: { fontSize: 24, color: colors.slate300 },
});
