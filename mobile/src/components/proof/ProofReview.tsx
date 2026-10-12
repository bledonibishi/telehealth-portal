import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';
import type { Field } from './DetailChip';

// Mirrors web/src/components/onboarding/ProofReview.tsx.

export type ProofCheck = {
  key: Field;
  status: 'PASS' | 'FAIL' | 'REVIEW';
  value?: string | null;
  hint?: string | null;
};

const CHECK_LABEL: Record<Field, string> = {
  NAME: 'Your name',
  MEDICINE: 'Medicine',
  DOSE: 'Dose',
  DATE: 'Date',
};

export const PROOF_STEPS = ['Reading your document', 'Checking your name', 'Checking the medicine and dose', 'Checking the date'];
export const NAME_EVIDENCE_STEPS = ['Reading your document', 'Looking for your previous and current names', 'Matching them with your account'];

type IconState = 'pass' | 'warn' | 'neutral' | 'active' | 'waiting';

function CheckIcon({ state }: { state: IconState }) {
  if (state === 'active') return <ActivityIndicator size="small" color={colors.brand600} style={styles.icon} />;
  const look = {
    pass: { bg: colors.brand100, fg: colors.brand700, ch: '✓' },
    warn: { bg: colors.amber100, fg: colors.amber700, ch: '!' },
    neutral: { bg: colors.slate100, fg: colors.slate500, ch: '–' },
    waiting: { bg: colors.slate100, fg: colors.slate300, ch: '•' },
  }[state];
  return (
    <View style={[styles.icon, { backgroundColor: look.bg }]}>
      <Text style={[styles.iconText, { color: look.fg }]}>{look.ch}</Text>
    </View>
  );
}

/**
 * Shown while the document is being read (a few seconds). The steps advance on a timer — the
 * request is a single call — and the last one keeps spinning until the answer arrives.
 */
export function ChecklistLoader({ title, steps }: { title: string; steps: string[] }) {
  const [current, setCurrent] = useState(0);
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    const t = setInterval(() => setCurrent((c) => Math.min(c + 1, steps.length - 1)), 1400);
    return () => clearInterval(t);
  }, [steps.length, appear]);

  return (
    <Animated.View style={[styles.loader, { opacity: appear }]} accessibilityLiveRegion="polite">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>This usually takes a few seconds. Please keep the app open.</Text>
      <View style={[styles.card, { marginTop: 24 }]}>
        {steps.map((step, i) => (
          <View key={step} style={[styles.loaderRow, i > 0 && styles.divider]}>
            <CheckIcon state={i < current ? 'pass' : i === current ? 'active' : 'waiting'} />
            <Text style={[styles.loaderText, i > current && { color: colors.slate400 }]}>{step}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

/** What was read off the document, one line per check: green when it matches, amber when it doesn't. */
export function ProofChecklist({ checks, doseQuestion }: { checks: ProofCheck[]; doseQuestion?: React.ReactNode }) {
  return (
    <View style={[styles.card, { marginTop: 20 }]}>
      <Text style={styles.cardLabel}>WHAT WE CHECKED</Text>
      {checks.map((c, i) => (
        <View key={c.key} style={[styles.checkRow, i > 0 && styles.divider]}>
          <CheckIcon state={c.status === 'PASS' ? 'pass' : c.status === 'FAIL' ? 'warn' : 'neutral'} />
          <View style={{ flex: 1 }}>
            <View style={styles.checkHeader}>
              <Text style={styles.checkLabel}>{CHECK_LABEL[c.key]}</Text>
              <Text
                numberOfLines={1}
                style={[styles.checkValue, c.status === 'FAIL' ? { color: colors.amber800, fontWeight: '600' } : { color: colors.slate600 }]}
              >
                {c.value ?? 'Not found'}
              </Text>
            </View>
            {c.status !== 'PASS' && !!c.hint && <Text style={styles.checkHint}>{c.hint}</Text>}
            {c.key === 'DOSE' && doseQuestion}
          </View>
        </View>
      ))}
    </View>
  );
}

export type DoseChoice = 'DOCUMENT_CORRECT' | 'STEPPED_UP_SINCE' | 'STEPPED_DOWN_SINCE' | 'NOT_SURE';

const mgText = (mg: number) => `${mg} mg`;

/**
 * The document's dose differs from the one the patient gave: both side by side, why it matters, and
 * "what's your current dose?" — each answer saying what happens next. The options follow which dose
 * is higher, so nobody is asked whether they "moved up" to a lower dose. Mirrors the web version.
 */
export function DoseQuestion({
  documentMg,
  reportedDose,
  saving,
  onAnswer,
}: {
  documentMg: number;
  reportedDose: string;
  saving: boolean;
  onAnswer: (choice: DoseChoice) => void;
}) {
  const [choice, setChoice] = useState<DoseChoice | null>(null);
  const reportedMg = parseFloat(reportedDose);
  const went = reportedMg > documentMg ? 'up' : 'down';
  const lower = mgText(Math.min(documentMg, reportedMg));
  const doc = mgText(documentMg);

  const options: { value: DoseChoice; title: string; detail: string }[] = [
    { value: 'DOCUMENT_CORRECT', title: `${doc} — the document is right`, detail: `Your clinician will go by ${doc}.` },
    went === 'up'
      ? {
          value: 'STEPPED_UP_SINCE',
          title: `${reportedDose} — my dose went up after this document`,
          detail: `Upload a newer document showing ${reportedDose} if you have one. Until then your clinician goes by ${doc}.`,
        }
      : {
          value: 'STEPPED_DOWN_SINCE',
          title: `${reportedDose} — my dose went down after this document`,
          detail: `No need to upload anything — your clinician will go by ${reportedDose}.`,
        },
    { value: 'NOT_SURE', title: 'I’m not sure', detail: `Your clinician will confirm it with you, going by the lower dose (${lower}) until then.` },
  ];

  return (
    <View style={styles.mismatch}>
      <View style={styles.mismatchHeader}>
        <View style={[styles.icon, { backgroundColor: colors.amber100 }]}>
          <Text style={[styles.iconText, { color: colors.amber700 }]}>!</Text>
        </View>
        <Text style={styles.mismatchTitle}>Your dose doesn’t match</Text>
      </View>

      <View style={styles.compare}>
        <View style={styles.tile}>
          <Text style={styles.tileLabel}>On your document</Text>
          <Text style={styles.tileValue}>{doc}</Text>
        </View>
        <Text style={styles.notEqual}>≠</Text>
        <View style={styles.tile}>
          <Text style={styles.tileLabel}>You told us</Text>
          <Text style={styles.tileValue}>{reportedDose}</Text>
        </View>
      </View>

      <Text style={styles.why}>We use your current dose to decide where you can safely continue.</Text>
      <Text style={styles.questionTitle}>What’s your current weekly dose?</Text>

      <View style={{ gap: 8, marginTop: 8 }} accessibilityRole="radiogroup">
        {options.map((o) => {
          const selected = choice === o.value;
          return (
            <Pressable
              key={o.value}
              onPress={() => setChoice(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <View style={[styles.radio, selected && styles.radioSelected, { marginTop: 2 }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>{o.title}</Text>
                <Text style={styles.optionDetail}>{o.detail}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Pressable onPress={() => choice && onAnswer(choice)} disabled={!choice || saving} style={[styles.confirm, (!choice || saving) && { opacity: 0.4 }]}>
        <Text style={styles.confirmText}>{saving ? 'Saving…' : 'Confirm'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 12, fontWeight: '700' },
  loader: { paddingVertical: 8 },
  title: { fontSize: 20, fontWeight: '700', color: colors.slate900 },
  subtitle: { fontSize: 14, color: colors.slate500, marginTop: 6, lineHeight: 20 },
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.slate100 },
  divider: { borderTopWidth: 1, borderTopColor: colors.slate100 },
  loaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  loaderText: { fontSize: 14, color: colors.slate800 },
  cardLabel: { fontSize: 11, fontWeight: '600', color: colors.slate400, letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  checkHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  checkLabel: { fontSize: 14, fontWeight: '500', color: colors.slate900 },
  checkValue: { fontSize: 14, flexShrink: 1, textAlign: 'right' },
  checkHint: { fontSize: 12, color: colors.slate500, marginTop: 3, textAlign: 'right' },
  mismatch: { marginTop: 20, borderRadius: 16, borderWidth: 1, borderColor: colors.amber200, backgroundColor: colors.amber50, padding: 14 },
  mismatchHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mismatchTitle: { fontSize: 15, fontWeight: '700', color: colors.amber900 },
  compare: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  tile: { flex: 1, backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.amber100, paddingVertical: 10, alignItems: 'center' },
  tileLabel: { fontSize: 11, color: colors.slate500 },
  tileValue: { fontSize: 18, fontWeight: '700', color: colors.slate900, marginTop: 2 },
  notEqual: { fontSize: 18, fontWeight: '700', color: colors.amber700 },
  why: { fontSize: 12, color: colors.amber900, marginTop: 10, lineHeight: 17 },
  questionTitle: { fontSize: 14, fontWeight: '700', color: colors.slate900, marginTop: 12 },
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderColor: colors.slate200, backgroundColor: colors.white, borderRadius: 12, padding: 11 },
  optionSelected: { borderColor: colors.brand500, borderWidth: 2, padding: 10 },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.slate300 },
  radioSelected: { borderColor: colors.brand600, backgroundColor: colors.brand600 },
  optionTitle: { fontSize: 14, fontWeight: '600', color: colors.slate900 },
  optionDetail: { fontSize: 12, color: colors.slate500, marginTop: 2, lineHeight: 17 },
  confirm: { marginTop: 12, backgroundColor: colors.brand600, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  confirmText: { color: colors.white, fontWeight: '700', fontSize: 14 },
});
