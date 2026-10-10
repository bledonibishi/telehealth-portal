import React from 'react';
import { useQuery } from '@apollo/client';
import { MY_PRODUCT_KIND } from '../../graphql/portal';
import { UNREAD_NOTIFICATION_COUNT } from '../../graphql/operations';
import { Card, Columns, Screen } from '../../components/ui';
import { MenuRow } from '../../components/MenuRow';
import { signOut } from '../../lib/session';

/** Everything that isn't a tab: notifications, the doctor, orders and payments, side effects, reports, a new consultation. */
export function MoreScreen({ navigation }: any) {
  const { data } = useQuery(MY_PRODUCT_KIND, { fetchPolicy: 'cache-first' });
  const glp1 = data?.myProductKind === 'GLP1';
  const { data: unreadData } = useQuery(UNREAD_NOTIFICATION_COUNT, { fetchPolicy: 'cache-and-network' });
  const unread: number = unreadData?.unreadNotificationCount ?? 0;
  return (
    <Screen title="More" subtitle="Your treatment, orders and account.">
      <Columns>
        <Card style={{ padding: 6 }}>
          <MenuRow icon="🔔" label="Notifications" hint={unread ? `${unread} unread` : 'Replies, decisions and order updates'} badge={unread} onPress={() => navigation.navigate('Notifications')} />
          <MenuRow icon="🩺" label="My Doctor" hint="Your care team, hours and recent appointments" onPress={() => navigation.navigate('Doctor')} />
          <MenuRow icon="📦" label="Orders & payments" hint="Deliveries, tracking, invoices" onPress={() => navigation.navigate('Orders')} />
          <MenuRow icon="💳" label="Stop or refund" hint="Stop future payments or ask for your money back" onPress={() => navigation.navigate('Account')} />
          <MenuRow icon="🤒" label="Side effects" hint={glp1 ? 'Your weekly check and what you’ve reported' : 'What you’ve reported to your doctor'} onPress={() => navigation.navigate('SideEffects')} />
          {glp1 && <MenuRow icon="📄" label="Check-in reports" hint="A PDF after each check-in" onPress={() => navigation.navigate('Reports')} />}
        </Card>
        <Card style={{ padding: 6 }}>
          <MenuRow icon="📝" label="New consultation" hint="Start a medical questionnaire" onPress={() => navigation.navigate('NewConsultation')} />
          {__DEV__ && <MenuRow icon="🧩" label="Component library" hint="Developers only: Storybook" onPress={() => navigation.navigate('Storybook')} />}
          <MenuRow icon="🚪" label="Sign out" hint="You’ll need to sign in again" onPress={signOut} />
        </Card>
      </Columns>
    </Screen>
  );
}
