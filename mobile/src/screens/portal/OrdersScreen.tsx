import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { CREATE_BILLING_PORTAL_SESSION, ME_BASIC_INFO, MY_INVOICES, MY_ORDERS, MY_SUPPLY_STATUS, REQUEST_REFILL } from '../../graphql/portal';
import { Button, Card, CardTitle, Columns, Empty, ErrorText, Notice, Pill, Screen } from '../../components/ui';
import { fmtDate, money } from '../../lib/format';
import { ORDER_POLL_MS, TRACKING_LABEL, TRACKING_PROBLEMS, expectedDelivery, shortDateTime } from '../../lib/delivery';
import { openLink, PORTAL_URL } from '../../lib/config';
import { colors } from '../../theme';
import { SkeletonCard } from '../../components/Skeleton';

const STEPS = ['Processing', 'Shipped', 'On the way', 'Delivered'] as const;
const STATUS: Record<string, { label: string; tone: 'warn' | 'info' | 'good' | 'plain' | 'danger'; step: number }> = {
  PENDING: { label: 'Processing', tone: 'warn', step: 0 },
  DISPATCHED: { label: 'Shipped', tone: 'info', step: 1 },
  OUT_FOR_DELIVERY: { label: 'On the way', tone: 'info', step: 2 },
  DELIVERED: { label: 'Delivered', tone: 'good', step: 3 },
  CANCELLED: { label: 'Cancelled', tone: 'plain', step: -1 },
};

function Tracker({ step }: { step: number }) {
  return (
    <View style={styles.tracker} accessible accessibilityLabel={`Delivery progress: ${STEPS[Math.max(step, 0)]}`}>
      {STEPS.map((label, i) => (
        <View key={label} style={styles.trackStep}>
          <View style={styles.trackLine}>
            <View style={[styles.trackSeg, { opacity: i === 0 ? 0 : 1 }, i <= step && styles.trackOn]} />
            <View style={[styles.trackDot, i <= step && styles.trackOn, i === step && styles.trackNow]} />
            <View style={[styles.trackSeg, { opacity: i === STEPS.length - 1 ? 0 : 1 }, i < step && styles.trackOn]} />
          </View>
          <Text style={[styles.trackLabel, i <= step && { color: colors.slate800, fontWeight: '700' }]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const oneLine = (a: any) => [a.addressLine1, a.addressLine2, [a.postcode, a.city].filter(Boolean).join(' '), a.country].filter(Boolean).join(', ');

/** The next supply, each delivery with where it is and where it goes, and what the patient has paid. */
export function OrdersScreen({ navigation }: any) {
  const { data, loading, error, refetch } = useQuery(MY_ORDERS, { fetchPolicy: 'cache-and-network', pollInterval: ORDER_POLL_MS });
  const { data: profile } = useQuery(ME_BASIC_INFO, { fetchPolicy: 'cache-first' });
  const { data: supplyData } = useQuery(MY_SUPPLY_STATUS, { fetchPolicy: 'cache-and-network' });
  const { data: invoiceData, error: invoiceError } = useQuery(MY_INVOICES, { fetchPolicy: 'cache-and-network' });
  const [request, { loading: requesting, error: requestError }] = useMutation(REQUEST_REFILL, {
    update: (cache, { data: res }) => res && cache.writeQuery({ query: MY_SUPPLY_STATUS, data: { mySupplyStatus: res.requestRefill } }),
  });
  const [openPortal, { loading: opening, error: portalError }] = useMutation(CREATE_BILLING_PORTAL_SESSION);

  const [openActivity, setOpenActivity] = React.useState<string | null>(null);
  const orders: any[] = data?.myOrders ?? [];
  const invoices: any[] = invoiceData?.myInvoices ?? [];
  const supply = supplyData?.mySupplyStatus;

  const hint = (() => {
    switch (supply?.refillState) {
      case 'READY': return null;
      case 'REQUESTED': return 'Requested. Your doctor will approve it, then it goes to the pharmacy.';
      case 'NOT_YET': {
        const d = new Date(Date.now() + supply.refillOpensInDays * 86_400_000);
        return `You can order from ${fmtDate(d, { day: 'numeric', month: 'short' })} (${supply.refillOpensInDays === 1 ? 'tomorrow' : `in ${supply.refillOpensInDays} days`}), a few days before your supply runs out. Your doctor approves each repeat, so it isn’t sent automatically.`;
      }
      case 'CHECK_IN_FIRST': return 'Complete your check-in first, so your doctor can approve it.';
      case 'IN_REVIEW': return 'Your doctor is reviewing your check-in. Your next supply follows from that.';
      case 'NO_REPEATS': return 'No repeats left. Your doctor will arrange a new prescription.';
      default: return supply?.supplyBeingPrepared ? 'Your next supply is already being prepared.' : 'Available once your first supply has shipped.';
    }
  })();

  const manage = async () => {
    try {
      const { data: res } = await openPortal();
      if (res?.createBillingPortalSession?.url) await openLink(res.createBillingPortalSession.url);
    } catch { /* shown from `portalError` */ }
  };

  return (
    <Screen title="Orders" subtitle="Your deliveries and where they are." refreshing={loading} onRefresh={() => refetch()}>
      <View style={{ gap: 14 }}>
        {supply && (
          <Card>
            <CardTitle title="Next supply" subtitle={supply.medication ?? undefined} />
            {supply.refillState === 'REQUESTED' ? <Pill label="✓ Refill requested" tone="good" /> : <Button label="Order next dose early" onPress={() => request().catch(() => undefined)} disabled={supply.refillState !== 'READY'} loading={requesting} />}
            {!!hint && <Text style={styles.hint}>{hint}</Text>}
            <ErrorText error={requestError} />
          </Card>
        )}

        {loading && !orders.length && <><SkeletonCard lines={4} label="Loading your orders…" /><SkeletonCard lines={4} label="Loading your orders…" /></>}
        {!data && <ErrorText error={error} />}
        {!loading && !error && !orders.length && <Card><Empty>Your first supply is being prepared by the pharmacy. It shows here, with tracking, as soon as it is on its way.</Empty></Card>}

        <Columns>
          {orders.map((o) => {
            const st = STATUS[o.status] ?? STATUS.PENDING;
            const sent = o.shippingAddress;
            const home = profile?.me;
            return (
              <Card key={o.id}>
                <View style={styles.orderHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderName}>{o.prescription?.medication} {o.prescription?.dosage}</Text>
                    <Text style={styles.muted}>Order {o.reference} · {o.sequence === 1 ? 'First supply' : `Repeat ${o.sequence - 1}`} · placed {fmtDate(o.createdAt)}</Text>
                  </View>
                  <Pill label={st.label} tone={st.tone} />
                </View>
                {st.step >= 0 && <Tracker step={st.step} />}
                {o.status !== 'CANCELLED' && (
                  <Text style={styles.address}>
                    {sent ? (o.status === 'PENDING' ? 'Delivering to' : 'Sent to') : 'Will be delivered to'}: <Text style={styles.bold}>{sent ? oneLine(sent) : home ? oneLine(home) : 'the address on your profile'}</Text>
                    {!sent && o.status === 'PENDING' && <Text style={styles.link} onPress={() => openLink(`${PORTAL_URL}/profile`)}>  Change address</Text>}
                  </Text>
                )}
                {(o.status === 'DISPATCHED' || o.status === 'OUT_FOR_DELIVERY') && expectedDelivery(o) && (
                  <Text style={styles.address}>{o.status === 'OUT_FOR_DELIVERY' ? 'Out for delivery today · ' : ''}Expected <Text style={styles.bold}>{expectedDelivery(o)}</Text></Text>
                )}
                {o.status !== 'DELIVERED' && o.trackingEvents?.[0] && TRACKING_PROBLEMS.includes(o.trackingEvents[0].status) && (
                  <View style={{ marginTop: 10 }}><Notice tone="warn">{TRACKING_LABEL[o.trackingEvents[0].status]}</Notice></View>
                )}
                {(o.carrier || o.trackingNumber) && <Text style={styles.muted}>{[o.carrier, o.trackingNumber && `Tracking: ${o.trackingNumber}`].filter(Boolean).join(' · ')}</Text>}
                {!!o.trackingUrl && <Button small variant="soft" label="🚚 Track order" onPress={() => openLink(o.trackingUrl)} style={{ alignSelf: 'flex-start', marginTop: 10 }} />}
                {o.trackingEvents?.length > 0 && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.link} onPress={() => setOpenActivity((id) => (id === o.id ? null : o.id))}>{openActivity === o.id ? 'Hide order activity' : 'Order activity'}</Text>
                    {openActivity === o.id && o.trackingEvents.map((e: any) => (
                      <View key={e.id} style={{ marginTop: 8 }}>
                        <Text style={styles.bold}>{TRACKING_LABEL[e.status] ?? e.status}</Text>
                        <Text style={styles.muted}>{shortDateTime(e.occurredAt)}{e.location ? ` · ${e.location}` : ''}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            );
          })}
        </Columns>

        <Card>
          <CardTitle title="Payments & invoices" subtitle="What you’ve paid for your treatment." right={<Button small variant="outline" label="💳 Manage" loading={opening} onPress={manage} />} />
          <ErrorText error={portalError} />
          {!invoiceData && <ErrorText error={invoiceError} />}
          {invoiceData && invoices.length === 0 && <Empty>Your payments will show here, each with a downloadable invoice.</Empty>}
          {invoices.map((i, idx) => (
            <View key={i.id} style={[styles.invoice, idx > 0 && styles.rowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.amount}>{money(i.amountCents, i.currency)} {i.status === 'UNPAID' && <Text style={styles.due}> Payment due</Text>}</Text>
                <Text style={styles.muted}>{fmtDate(i.createdAt)}{i.status === 'PAID' && i.cardLast4 ? ` · ${i.cardBrand ? i.cardBrand.charAt(0).toUpperCase() + i.cardBrand.slice(1) : 'Card'} •••• ${i.cardLast4}` : ''}{i.description ? ` · ${i.description}` : ''}</Text>
              </View>
              {(i.pdfUrl || i.viewUrl) && <Button small variant="link" label={i.pdfUrl ? 'PDF' : 'View'} onPress={() => openLink(i.pdfUrl ?? i.viewUrl)} />}
            </View>
          ))}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, color: colors.slate600, backgroundColor: colors.slate50, borderRadius: 12, padding: 10, marginTop: 10, lineHeight: 17 },
  orderHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  orderName: { fontSize: 16, fontWeight: '800', color: colors.ink900 },
  muted: { fontSize: 12, color: colors.slate500, lineHeight: 17, marginTop: 2 },
  tracker: { flexDirection: 'row', marginTop: 16, marginBottom: 6 },
  trackStep: { flex: 1, alignItems: 'center' },
  trackLine: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  trackSeg: { flex: 1, height: 3, backgroundColor: colors.slate200 },
  trackDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.slate200 },
  trackOn: { backgroundColor: colors.ink700 },
  trackNow: { borderWidth: 3, borderColor: colors.ink100, width: 18, height: 18, borderRadius: 9 },
  trackLabel: { fontSize: 10, color: colors.slate400, marginTop: 6, textAlign: 'center' },
  address: { fontSize: 12, color: colors.slate600, marginTop: 10, lineHeight: 18 },
  bold: { fontWeight: '700', color: colors.ink900 },
  link: { fontWeight: '700', color: colors.ink600 },
  invoice: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.slate100 },
  amount: { fontSize: 15, fontWeight: '800', color: colors.ink900 },
  due: { fontSize: 11, fontWeight: '700', color: colors.amber800 },
});
