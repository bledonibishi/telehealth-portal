import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@apollo/client';
import { MY_APPOINTMENTS, MY_CARE_TEAM } from '../../graphql/portal';
import { MY_CONSULTATIONS } from '../../graphql/operations';
import { Button, Card, CardTitle, Columns, Empty, ErrorText, Screen } from '../../components/ui';
import { EMERGENCY_NUMBER, openLink, PORTAL_URL, SUPPORT_HOURS } from '../../lib/config';
import { fmtDate } from '../../lib/format';
import { colors } from '../../theme';
import { SkeletonRows } from '../../components/Skeleton';

type Member = { id: string; name: string; role: string; licensingBody?: string | null; primary: boolean; involvement: string; since: string; specialty?: string | null; bio?: string | null; languages: string[] };
type Appointment = { id: string; reason: string; status: string; scheduledFor?: string | null; createdAt: string; clinicianName?: string | null; clinicianNote?: string | null };

const REASON_LABEL: Record<string, string> = { QUESTION: 'A question', CHECK_UP: 'Check-up', SIDE_EFFECT: 'Side effect', PAIN: 'Pain', DOSE_CHANGE: 'Dose change', OTHER: 'Something else' };
const initials = (name: string) => name.replace(/^Dr\.\s+/, '').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

/** Who is looking after the patient, their main doctor first, the two ways to reach them, and recent appointments. */
export function DoctorScreen({ navigation }: any) {
  const { data, loading, error, refetch } = useQuery(MY_CARE_TEAM, { fetchPolicy: 'cache-and-network' });
  const { data: apptData } = useQuery(MY_APPOINTMENTS, { fetchPolicy: 'cache-and-network' });
  const { data: consultations } = useQuery(MY_CONSULTATIONS, { fetchPolicy: 'cache-first' });
  const team: Member[] = data?.myCareTeam ?? [];
  const lead = team.find((m) => m.primary);
  const others = team.filter((m) => !m.primary);
  const recent: Appointment[] = ((apptData?.myAppointments ?? []) as Appointment[])
    .filter((a) => a.status === 'COMPLETED')
    .sort((a, b) => (b.scheduledFor ?? b.createdAt).localeCompare(a.scheduledFor ?? a.createdAt))
    .slice(0, 3);
  const latestConsultationId: string | undefined = consultations?.myConsultations?.[0]?.id;
  const message = () => navigation.navigate('Messages', latestConsultationId ? { consultationId: latestConsultationId } : undefined);

  return (
    <Screen title="My Doctor" subtitle="The clinicians looking after your treatment." refreshing={loading} onRefresh={() => refetch()}>
      {loading && !team.length && <Card><SkeletonRows rows={3} label="Loading your care team…" /></Card>}
      {!data && <ErrorText error={error} />}
      {!loading && !team.length && (
        <Card>
          <Empty>A doctor is assigned when your consultation is reviewed. You can already message our team with any question.</Empty>
          <Button label="Open Messages" onPress={message} style={{ marginTop: 12 }} />
        </Card>
      )}

      <View style={{ gap: 14 }}>
        {lead && (
          <Card>
            <View style={styles.leadRow}>
              <View style={styles.avatarLg}><Text style={styles.avatarLgText}>{initials(lead.name)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.badge}>♥ Your main doctor</Text>
                <Text style={styles.leadName}>{lead.name}</Text>
                <Text style={styles.muted}>{[lead.specialty ?? lead.role, lead.licensingBody ? `registered with ${lead.licensingBody}` : null].filter(Boolean).join(' · ')}</Text>
                <Text style={styles.tiny}>{lead.involvement} · with you since {fmtDate(lead.since, { month: 'long', year: 'numeric' })}</Text>
              </View>
            </View>
            {!!lead.bio && <Text style={styles.bio}>{lead.bio}</Text>}
            {(lead.languages.length > 0 || SUPPORT_HOURS) && (
              <View style={{ gap: 3, marginTop: 10 }}>
                {lead.languages.length > 0 && <Text style={styles.fact}><Text style={styles.factLabel}>Speaks  </Text>{lead.languages.join(', ')}</Text>}
                {SUPPORT_HOURS && <Text style={styles.fact}><Text style={styles.factLabel}>Care team hours  </Text>{SUPPORT_HOURS}</Text>}
              </View>
            )}
            <View style={styles.actions}>
              <Button label="Send a message" onPress={message} style={{ flex: 1 }} />
              <Button label="Book an appointment" variant="soft" onPress={() => openLink(`${PORTAL_URL}/appointments?new=1`)} style={{ flex: 1 }} />
            </View>
          </Card>
        )}

        <Columns>
          {others.length > 0 && (
            <Card>
              <CardTitle title={lead ? 'Also on your care team' : 'Your care team'} />
              {others.map((m, i) => (
                <View key={m.id} style={[styles.memberRow, i > 0 && styles.rowBorder]}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{initials(m.name)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{m.name}</Text>
                    <Text style={styles.muted}>{m.specialty ?? m.role} · {m.involvement}</Text>
                    {m.languages.length > 0 && <Text style={styles.tiny}>Speaks {m.languages.join(', ')}</Text>}
                  </View>
                </View>
              ))}
            </Card>
          )}
          {recent.length > 0 && (
            <Card>
              <CardTitle title="Recent appointments" />
              {recent.map((a, i) => (
                <View key={a.id} style={[{ paddingVertical: 8 }, i > 0 && styles.rowBorder]}>
                  <Text style={styles.memberName}>{REASON_LABEL[a.reason] ?? a.reason} <Text style={styles.muted}>· {fmtDate(a.scheduledFor ?? a.createdAt)}{a.clinicianName ? ` · ${a.clinicianName}` : ''}</Text></Text>
                  {!!a.clinicianNote && <Text style={styles.note} numberOfLines={3}>{a.clinicianNote}</Text>}
                </View>
              ))}
            </Card>
          )}
        </Columns>

        <Card tone="warn">
          <Text style={styles.warn}>Messages are read by your care team during working hours and are <Text style={{ fontWeight: '800' }}>not for emergencies</Text>. For chest pain, trouble breathing or severe stomach pain, call {EMERGENCY_NUMBER}.</Text>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  leadRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  avatarLg: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.ink100, alignItems: 'center', justifyContent: 'center' },
  avatarLgText: { fontSize: 24, fontWeight: '800', color: colors.ink800 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ink50, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '800', color: colors.ink700 },
  badge: { alignSelf: 'flex-start', fontSize: 11, fontWeight: '700', color: colors.ink800, backgroundColor: colors.ink50, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
  leadName: { fontSize: 20, fontWeight: '800', color: colors.ink900, marginTop: 6 },
  muted: { fontSize: 13, color: colors.slate500, lineHeight: 18 },
  tiny: { fontSize: 11, color: colors.slate400, marginTop: 3, lineHeight: 15 },
  bio: { fontSize: 14, color: colors.slate600, marginTop: 14, lineHeight: 21 },
  fact: { fontSize: 12, color: colors.slate700 },
  factLabel: { color: colors.slate400 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.slate100 },
  memberName: { fontSize: 14, fontWeight: '700', color: colors.ink900 },
  note: { fontSize: 13, color: colors.slate600, marginTop: 2, lineHeight: 19 },
  warn: { fontSize: 13, color: colors.amber900, lineHeight: 19 },
});
