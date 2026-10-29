import React from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@apollo/client';
import { ME_NAME, MY_CONSULTATIONS, MY_TREATMENT_PLAN } from '../../graphql/operations';
import { careStage } from '../../lib/careStage';
import { countdown, fmtDate } from '../../lib/format';
import { ErrorNotice } from '../../components/ErrorNotice';
import { LoadingState } from '../../components/Skeleton';
import { MenuRow } from '../../components/MenuRow';
import { Button, Card, CardTitle, Columns, Notice, Pill, ProgressBar, Screen, Stat } from '../../components/ui';
import { colors } from '../../theme';
import { GuideTarget, useScreenGuide } from '../../components/guide/GuideProvider';
import { HOME_TOUR } from '../../lib/guideTours';

// The doctor's decision arrives while the app is open: look again this often.
const POLL_MS = 30_000;

const STATUS: Record<string, { label: string; tone: 'plain' | 'good' | 'warn' | 'info' }> = {
  SUBMITTED: { label: 'Sent to your doctor', tone: 'info' },
  IN_REVIEW: { label: 'Being reviewed', tone: 'warn' },
  MORE_INFO_REQUESTED: { label: 'Needs a little more', tone: 'warn' },
  APPROVED: { label: 'Approved', tone: 'good' },
  DECLINED: { label: 'Not prescribed', tone: 'plain' },
};

const KIND: Record<string, { icon: string; label: string }> = {
  HRT: { icon: '🌸', label: 'Hormone therapy' },
  GLP1: { icon: '⚖️', label: 'Weight management' },
  TRT: { icon: '💪', label: 'Testosterone therapy' },
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

/** The home screen: a warm greeting, where the treatment stands, what to do next, and the consultations so far. */
export function ConsultationStatusScreen({ navigation }: any) {
  useScreenGuide(HOME_TOUR);
  const { data, loading, error, refetch } = useQuery(MY_CONSULTATIONS, { fetchPolicy: 'network-only', pollInterval: POLL_MS });
  const { data: planData, refetch: refetchPlan } = useQuery(MY_TREATMENT_PLAN, { fetchPolicy: 'network-only', pollInterval: POLL_MS });
  const { data: nameData } = useQuery(ME_NAME, { fetchPolicy: 'cache-first' });

  // Coming back to this tab shows where things stand now.
  React.useEffect(() => navigation.addListener('focus', () => { refetch(); refetchPlan(); }), [navigation, refetch, refetchPlan]);

  if (loading && !data) return <LoadingState fill label="Loading your treatment…" />;
  if (error && !data) return <View style={{ padding: 16 }}><ErrorNotice error={error} title="We couldn’t load your home screen" onRetry={() => refetch()} /></View>;

  const consultations: any[] = data?.myConsultations ?? [];
  const plan = planData?.myTreatmentPlan;
  const next = careStage(consultations, plan);
  const firstName: string | undefined = nameData?.me?.firstName;
  const hasDoses = (navigation.getState?.()?.routeNames ?? []).includes('Injections');

  const goToNext = () => {
    if (!next.action) return;
    if (next.action.tab === 'New Consultation') navigation.navigate('More', { screen: 'NewConsultation' });
    else navigation.navigate(next.action.tab === 'Status' ? 'Status' : next.action.tab);
  };

  return (
    <Screen
      title={`${greeting()}${firstName ? `, ${firstName}` : ''} 👋`}
      subtitle={plan ? 'Here’s how your treatment is going.' : 'We’re here with you at every step.'}
      refreshing={loading}
      onRefresh={() => { refetch(); refetchPlan(); }}
    >
      {!plan && (
        <GuideTarget id="home:next">
        <Notice tone={next.stage === 'MORE_INFO' ? 'warn' : 'info'} title={next.title} action={next.action ? <Button label={next.action.label} onPress={goToNext} small /> : undefined}>
          {next.text}
        </Notice>
        </GuideTarget>
      )}

      {plan && (
        <GuideTarget id="home:plan">
        <Card tone="info" style={{ marginBottom: 14 }}>
          <CardTitle title={plan.productName} subtitle={[plan.strength, plan.programme].filter(Boolean).join(' · ')} right={<Pill label="Active" tone="good" />} />
          {plan.dosesPlanned > 0 && (
            <View style={{ marginTop: 4, marginBottom: 14 }}>
              <ProgressBar percent={(plan.dosesTaken / plan.dosesPlanned) * 100} label={`${plan.dosesTaken} of ${plan.dosesPlanned} doses taken`} />
              <Text style={{ fontSize: 12, color: colors.slate500, marginTop: 6 }}>{plan.dosesTaken} of {plan.dosesPlanned} doses taken</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Stat label="Next dose" value={plan.nextDoseAt ? countdown(plan.nextDoseAt) : '—'} />
            {plan.nextDoseAt && <Stat label="On" value={fmtDate(plan.nextDoseAt, { weekday: 'short', day: 'numeric', month: 'short' })} />}
            {plan.repeatsLeft != null && <Stat label="Repeats left" value={String(plan.repeatsLeft)} />}
          </View>
          {!!plan.directions && <Text style={{ fontSize: 13, color: colors.slate600, lineHeight: 19, marginTop: 14 }}>{plan.directions}</Text>}
          {!!plan.prescriberName && <Text style={{ fontSize: 12, color: colors.slate400, marginTop: 8 }}>Prescribed by {plan.prescriberName}</Text>}
          {hasDoses && <View style={{ marginTop: 14 }}><Button label="Open my doses" onPress={() => navigation.navigate('Injections')} /></View>}
        </Card>
        </GuideTarget>
      )}

      <Columns>
        <Card style={{ padding: 6 }}>
          <View style={{ padding: 10 }}><CardTitle title="How can we help today?" /></View>
          <MenuRow icon="💬" label="Message us" hint="Questions, delivery, payments, or your doctor" onPress={() => navigation.navigate('Messages')} />
          <MenuRow icon="📦" label="My orders" hint="Where your medicine is, and what’s next" onPress={() => navigation.navigate('More', { screen: 'Orders' })} />
          <MenuRow icon="🤒" label="Not feeling right?" hint="Tell your doctor about a side effect" onPress={() => navigation.navigate('More', { screen: 'SideEffects' })} />
        </Card>

        <Card>
          <CardTitle title="Your consultations" subtitle={consultations.length ? undefined : 'Nothing here yet'} />
          {consultations.map((c) => {
            const kind = KIND[c.kind] ?? { icon: '🩺', label: c.kind };
            const status = STATUS[c.status] ?? { label: c.status, tone: 'plain' as const };
            return (
              <MenuRow key={c.id} icon={kind.icon} label={kind.label} hint={`${status.label} · sent ${fmtDate(c.submittedAt)}${c.prescription ? ` · ${c.prescription.medication}` : ''}`} onPress={() => navigation.navigate('Messages')} />
            );
          })}
        </Card>
      </Columns>
    </Screen>
  );
}
