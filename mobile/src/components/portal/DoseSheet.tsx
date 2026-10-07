import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation } from '@apollo/client';
import { MARK_DOSE_SKIPPED, MARK_DOSE_TAKEN, MY_DOSE_CALENDAR, MY_MISSED_DOSE_STATUS, UNMARK_DOSE } from '../../graphql/portal';
import { type Dose, doseName, isRotatingPen, missedDoseAdvice, visualStatus } from '../../lib/doses';
import { fmtDate, takenAtText } from '../../lib/format';
import { SITE_LABEL, suggestNextSite, type InjectionSite } from '../../lib/injectionSites';
import { BottomSheet } from '../BottomSheet';
import { Button, ErrorText, Pill } from '../ui';
import { InjectionGuideSheet } from './InjectionGuide';
import { SitePicker } from './SitePicker';
import { colors } from '../../theme';

export const STATUS_COLOR: Record<string, { solid: string; bg: string; text: string; label: string }> = {
  SCHEDULED: { solid: '#3b82f6', bg: '#eff6ff', text: '#1d4ed8', label: 'Scheduled' },
  DUE: { solid: '#f59e0b', bg: '#fffbeb', text: '#92400e', label: 'Due' },
  TAKEN: { solid: '#16a34a', bg: '#f0fdf4', text: '#166534', label: 'Taken' },
  MISSED: { solid: '#f43f5e', bg: '#fff1f2', text: '#9f1239', label: 'Missed' },
  SKIPPED: { solid: '#94a3b8', bg: '#f8fafc', text: '#475569', label: 'Skipped' },
};

function Body({ dose, needsClinician, lastSite, onClose }: { dose: Dose; needsClinician: boolean; lastSite: InjectionSite | null; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [site, setSite] = useState<InjectionSite | null>(null);
  const [guide, setGuide] = useState(false);
  const [error, setError] = useState('');
  const opts = { refetchQueries: [{ query: MY_DOSE_CALENDAR, variables: { fromDays: 60, toDays: 90 } }, { query: MY_MISSED_DOSE_STATUS }], onCompleted: onClose, onError: (e: Error) => setError(e.message) };
  const [markTaken, { loading: taking }] = useMutation(MARK_DOSE_TAKEN, opts);
  const [markSkipped, { loading: skipping }] = useMutation(MARK_DOSE_SKIPPED, opts);
  const [unmark, { loading: undoing }] = useMutation(UNMARK_DOSE, opts);

  const status = visualStatus(dose);
  const c = STATUS_COLOR[status];
  const pen = isRotatingPen(dose);
  const patch = dose.product.form === 'PATCH';
  const advice = missedDoseAdvice(dose, needsClinician);
  const askSite = pen && (dose.status === 'SCHEDULED' || dose.status === 'MISSED' || (dose.status === 'TAKEN' && !dose.injectionSite));
  const suggested = suggestNextSite(lastSite);

  return (
    <View style={{ gap: 12 }}>
      <View>
        <Text style={styles.name}>{doseName(dose)}</Text>
        <Text style={styles.date}>{fmtDate(dose.scheduledFor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Text>
      </View>
      <View style={{ flexDirection: 'row' }}><Pill label={status === 'DUE' ? 'Due: not yet logged' : c.label} tone={status === 'TAKEN' ? 'good' : status === 'MISSED' ? 'danger' : status === 'DUE' ? 'warn' : status === 'SKIPPED' ? 'plain' : 'info'} /></View>

      {!!dose.takenAt && <Text style={styles.taken}>✅ Taken {takenAtText(dose.takenAt)}</Text>}
      {!!dose.injectionSite && <Text style={styles.small}>Injected: {SITE_LABEL[dose.injectionSite as InjectionSite].toLowerCase()}</Text>}
      {!!dose.note && <Text style={styles.small}>Note: {dose.note}</Text>}
      {dose.product.requiresColdChain && <Text style={styles.small}>Keep refrigerated (2–8°C).</Text>}
      {patch && <Text style={styles.small}>Put the new patch on a different spot from the last one, below the waist.</Text>}
      {(dose.status === 'MISSED' || status === 'DUE') && !!advice && <Text style={styles.advice}>{advice}</Text>}

      {pen && <Button variant="link" label="How to inject →" onPress={() => setGuide(true)} />}
      {askSite && (
        <View style={styles.siteBox}>
          <Text style={styles.siteTitle}>Where are you injecting?</Text>
          <SitePicker value={site} suggested={suggested} last={lastSite} onChange={setSite} />
          {dose.status === 'TAKEN' && <Button small variant="soft" label="Save where I injected" disabled={!site} loading={taking} onPress={() => markTaken({ variables: { id: dose.id, injectionSite: site } })} style={{ marginTop: 12 }} />}
        </View>
      )}
      <ErrorText>{error}</ErrorText>

      {(dose.status === 'SCHEDULED' || dose.status === 'MISSED') && (
        <View style={{ gap: 10 }}>
          <Button label={taking ? 'Saving…' : patch ? 'Mark patch changed' : 'Mark as taken'} loading={taking} onPress={() => markTaken({ variables: { id: dose.id, injectionSite: pen ? site : undefined } })} />
          <TextInput value={note} onChangeText={setNote} placeholder="Reason for skipping (optional)" placeholderTextColor={colors.slate400} style={styles.input} />
          <Button variant="outline" label="Skip this dose" loading={skipping} onPress={() => markSkipped({ variables: { id: dose.id, note: note.trim() || undefined } })} />
        </View>
      )}
      {(dose.status === 'TAKEN' || dose.status === 'SKIPPED') && <Button variant="link" label="Undo" loading={undoing} onPress={() => unmark({ variables: { id: dose.id } })} />}

      <InjectionGuideSheet visible={guide} onClose={() => setGuide(false)} requiresColdChain={dose.product.requiresColdChain} />
    </View>
  );
}

/** One dose: its status and when it was taken, where it went in, and the buttons to log, skip or undo it. */
export function DoseSheet({ dose, needsClinician, lastSite, onClose }: { dose: Dose | null; needsClinician: boolean; lastSite: InjectionSite | null; onClose: () => void }) {
  return (
    <BottomSheet visible={!!dose} onClose={onClose}>
      {dose && <Body key={dose.id} dose={dose} needsClinician={needsClinician} lastSite={lastSite} onClose={onClose} />}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 17, fontWeight: '800', color: colors.slate900 },
  date: { fontSize: 12, color: colors.slate500, marginTop: 2 },
  taken: { fontSize: 14, fontWeight: '700', color: colors.emerald700 },
  small: { fontSize: 12, color: colors.slate500, lineHeight: 17 },
  advice: { fontSize: 13, color: colors.slate700, backgroundColor: colors.amber50, borderRadius: 12, padding: 12, lineHeight: 19 },
  siteBox: { borderTopWidth: 1, borderTopColor: colors.slate100, paddingTop: 12 },
  siteTitle: { fontSize: 13, fontWeight: '700', color: colors.slate700, marginBottom: 10 },
  input: { borderWidth: 1, borderColor: colors.slate200, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.slate900 },
});
