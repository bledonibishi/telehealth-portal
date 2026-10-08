import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, RefreshControl } from 'react-native';
import { useQuery } from '@apollo/client';
import { MY_ORDERS } from '../../graphql/operations';
import { ORDER_POLL_MS, ORDER_STATUS, STAGES, STAGE_OF, STAGE_TIME, TRACKING_LABEL, TRACKING_PROBLEMS, expectedDelivery, shortDate, shortDateTime } from '../../lib/delivery';
import { colors } from '../../theme';

function Tracker({ order }: { order: any }) {
  const current = STAGE_OF[order.status] ?? 0;
  return (
    <View style={styles.tracker} accessibilityLabel={`Order progress: ${STAGES[current]}`}>
      {STAGES.map((stage, i) => {
        const at = order[STAGE_TIME[i]] as string | null | undefined;
        const reached = i <= current;
        return (
          <View key={stage} style={styles.step}>
            {i < STAGES.length - 1 && <View style={[styles.line, i < current && styles.lineDone]} />}
            <View style={[styles.dot, reached && styles.dotDone, i === current && styles.dotNow]} />
            <Text style={[styles.stepLabel, reached && styles.stepLabelDone]}>{stage}</Text>
            {at && reached ? <Text style={styles.stepDate}>{shortDate(at)}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

function OrderCard({ order }: { order: any }) {
  const [showActivity, setShowActivity] = React.useState(false);
  const status = ORDER_STATUS[order.status];
  const expected = expectedDelivery(order);
  const latest = order.trackingEvents?.[0];
  const problem = order.status !== 'DELIVERED' && latest && TRACKING_PROBLEMS.includes(latest.status);

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.medicine}>{order.prescription?.medication} {order.prescription?.dosage}</Text>
          <Text style={styles.meta}>
            Order {order.reference} · {order.sequence === 1 ? 'First supply' : `Repeat ${order.sequence - 1}`} · placed {shortDate(order.createdAt)}
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: status?.bg }]}><Text style={[styles.pillText, { color: status?.fg }]}>{status?.label ?? order.status}</Text></View>
      </View>

      {order.status !== 'CANCELLED' && <Tracker order={order} />}

      {order.status === 'PENDING' && <Text style={styles.text}>Your pharmacy is preparing your order. We’ll email you as soon as it’s on its way.</Text>}
      {(order.status === 'DISPATCHED' || order.status === 'OUT_FOR_DELIVERY') && expected ? (
        <Text style={styles.expected}>{order.status === 'OUT_FOR_DELIVERY' ? 'Out for delivery today · ' : ''}Expected <Text style={styles.bold}>{expected}</Text></Text>
      ) : null}
      {problem ? <Text style={styles.problem} accessibilityRole="alert">{TRACKING_LABEL[latest.status]}</Text> : null}

      {(order.carrier || order.trackingNumber || order.trackingUrl) && (
        <View style={styles.trackingRow}>
          {order.carrier ? <Text style={styles.small}>{order.carrier}</Text> : null}
          {order.trackingNumber ? <Text style={styles.small}>Tracking: <Text style={styles.bold}>{order.trackingNumber}</Text></Text> : null}
          {order.trackingUrl ? (
            <TouchableOpacity onPress={() => Linking.openURL(order.trackingUrl)} accessibilityRole="link" hitSlop={8}>
              <Text style={styles.link}>Track order</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {order.trackingEvents?.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <TouchableOpacity onPress={() => setShowActivity((v) => !v)} hitSlop={8}>
            <Text style={styles.link}>{showActivity ? 'Hide order activity' : 'Order activity'}</Text>
          </TouchableOpacity>
          {showActivity && (
            <View style={styles.activity}>
              {order.trackingEvents.map((e: any) => (
                <View key={e.id} style={{ marginBottom: 8 }}>
                  <Text style={styles.activityTitle}>{TRACKING_LABEL[e.status] ?? e.status}</Text>
                  <Text style={styles.activityWhen}>{shortDateTime(e.occurredAt)}{e.location ? ` · ${e.location}` : ''}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/** Every supply the patient has had, newest first, each with where it is. */
export function OrdersScreen({ navigation }: any) {
  const { data, loading, error, refetch } = useQuery(MY_ORDERS, { fetchPolicy: 'cache-and-network', pollInterval: ORDER_POLL_MS });
  const [refreshing, setRefreshing] = React.useState(false);
  React.useEffect(() => navigation.addListener('focus', () => { refetch(); }), [navigation, refetch]);

  if (loading && !data) return <ActivityIndicator style={styles.center} />;
  if (error && !data) return <Text style={styles.error}>{error.message}</Text>;
  const orders: any[] = data?.myOrders ?? [];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Orders</Text>
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        renderItem={({ item }) => <OrderCard order={item} />}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); try { await refetch(); } finally { setRefreshing(false); } }} />}
        ListEmptyComponent={<Text style={styles.empty}>Your first supply is being prepared by the pharmacy. It shows here, with tracking, as soon as it is on its way.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.page, paddingHorizontal: 16, paddingTop: 56 },
  center: { flex: 1 },
  error: { padding: 24, color: colors.red700 },
  title: { fontSize: 22, fontWeight: '700', color: colors.slate900, marginBottom: 16 },
  empty: { marginTop: 24, textAlign: 'center', color: colors.slate500, lineHeight: 20 },
  card: { backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.slate200, padding: 16, marginBottom: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  medicine: { fontSize: 15, fontWeight: '600', color: colors.slate900 },
  meta: { fontSize: 12, color: colors.slate500, marginTop: 2 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: '700' },
  tracker: { flexDirection: 'row', marginTop: 18 },
  step: { flex: 1, alignItems: 'center' },
  line: { position: 'absolute', top: 6, left: '50%', width: '100%', height: 2, backgroundColor: colors.slate200 },
  lineDone: { backgroundColor: colors.brand700 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.slate300, backgroundColor: colors.white },
  dotDone: { backgroundColor: colors.brand700, borderColor: colors.brand700 },
  dotNow: { borderWidth: 4, borderColor: colors.brand100, backgroundColor: colors.brand700 },
  stepLabel: { fontSize: 10, marginTop: 6, color: colors.slate400, textAlign: 'center' },
  stepLabelDone: { color: colors.slate900, fontWeight: '600' },
  stepDate: { fontSize: 10, color: colors.slate400 },
  text: { marginTop: 14, fontSize: 13, color: colors.slate600, lineHeight: 19 },
  expected: { marginTop: 14, fontSize: 13, color: colors.slate900 },
  bold: { fontWeight: '700', color: colors.slate900 },
  problem: { marginTop: 14, backgroundColor: colors.amber50, color: colors.amber800, borderRadius: 8, padding: 10, fontSize: 13, overflow: 'hidden' },
  trackingRow: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  small: { fontSize: 12, color: colors.slate600 },
  link: { fontSize: 12, fontWeight: '700', color: colors.brand700 },
  activity: { marginTop: 10, paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: colors.slate200 },
  activityTitle: { fontSize: 12, fontWeight: '600', color: colors.slate900 },
  activityWhen: { fontSize: 11, color: colors.slate400 },
});
