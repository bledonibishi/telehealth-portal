import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { CONSENT_TEXT, MY_CONSULTATIONS, MY_PRODUCT_KIND, QUESTIONNAIRE, SUBMIT_INTAKE_QUIZ } from '../../graphql/operations';
import { ConsultationKind } from '@telehealth/shared-types';

type Question = {
  id: string;
  text: string;
  help?: string | null;
  type: 'single' | 'multi' | 'number' | 'text';
  optional: boolean;
  min?: number | null;
  max?: number | null;
  unit?: string | null;
  options?: { value: string; label: string; exclusive: boolean }[] | null;
  showIf?: { questionId: string; anyOf: string[] } | null;
};

// Option values for single/multi, raw input for number/text.
type Values = Record<string, string[]>;

const isVisible = (q: Question, values: Values) =>
  !q.showIf || (values[q.showIf.questionId] ?? []).some((v) => q.showIf!.anyOf.includes(v));

function toAnswer(q: Question, selected: string[]) {
  const answer = q.options
    ? selected.map((v) => q.options!.find((o) => o.value === v)?.label ?? v).join(', ')
    : selected[0] ?? '';
  return { questionId: q.id, answer, value: selected.join('|') };
}

// Questions come from the backend (the same questionnaire the web portal
// shows); the server re-validates every answer and decides what it means.
export function IntakeQuizScreen({ navigation, route }: any) {
  // The same questionnaire is a step of onboarding (then "done" goes back to the checklist) and a tab afterwards.
  const inOnboarding = route?.name === 'MedicalQuestionnaire';
  const { data: kindData, loading: kindLoading } = useQuery(MY_PRODUCT_KIND);
  const [chosenKind, setChosenKind] = useState<ConsultationKind | null>(null);
  const kind: ConsultationKind | null = chosenKind ?? kindData?.myProductKind ?? null;

  const { data, loading } = useQuery(QUESTIONNAIRE, { variables: { kind, stage: 'INTAKE' }, skip: !kind });
  const questions: Question[] = data?.questionnaire?.questions ?? [];
  const { data: consentData } = useQuery(CONSENT_TEXT, { variables: { type: 'TELEHEALTH' } });
  const consent = consentData?.consentText;

  const [values, setValues] = useState<Values>({});
  const [history, setHistory] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  const [submit, { loading: submitting }] = useMutation(SUBMIT_INTAKE_QUIZ, {
    refetchQueries: [{ query: MY_CONSULTATIONS }],
    onCompleted() {
      Alert.alert('Submitted', 'Your answers are with our clinical team. We’ll be in touch soon.', [
        { text: 'OK', onPress: () => (inOnboarding ? navigation.goBack() : navigation.navigate('Status')) },
      ]);
    },
    onError(e) {
      // Walk back through the questions with earlier answers kept, so the
      // patient can correct what the server rejected.
      Alert.alert('Please check your answers', e.message);
      setHistory([]);
      const first = questions[0];
      setDraft(first && !first.options ? (values[first.id] ?? []).join('') : '');
    },
  });

  // The next question is the first visible one not yet answered in this pass.
  const current = questions.find((q) => isVisible(q, values) && !history.includes(q.id));
  const visibleCount = questions.filter((q) => isVisible(q, values)).length;

  const answer = (selected: string[]) => {
    if (!current) return;
    const nextValues = { ...values, [current.id]: selected };
    const nextHistory = [...history, current.id];
    setValues(nextValues);
    setHistory(nextHistory);

    const remaining = questions.find((q) => isVisible(q, nextValues) && !nextHistory.includes(q.id));
    setDraft(remaining && !remaining.options ? (nextValues[remaining.id] ?? []).join('') : '');
    // Once every question is answered the consent screen shows; submitting happens there.
  };

  const submitWithConsent = () => {
    const answers = questions
      .filter((q) => isVisible(q, values) && (values[q.id] ?? []).some((v) => v.trim()))
      .map((q) => toAnswer(q, values[q.id]));
    submit({ variables: { input: { kind, answers, telehealthConsentVersion: consent?.version } } });
  };

  const back = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory(history.slice(0, -1));
    setDraft((values[previous] ?? []).join(''));
  };

  if (kindLoading || (kind && loading)) {
    return <View style={styles.container}><ActivityIndicator /></View>;
  }

  if (!kind) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Start a consultation</Text>
        <Text style={styles.sub}>What type of treatment are you seeking?</Text>
        <TouchableOpacity style={styles.option} onPress={() => setChosenKind(ConsultationKind.HRT)}>
          <Text style={styles.optionText}>HRT — Hormone Replacement Therapy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.option} onPress={() => setChosenKind(ConsultationKind.GLP1)}>
          <Text style={styles.optionText}>GLP-1 — Weight management</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!current) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Before you send this</Text>
        {consent?.text.split('\n').map((line: string) => (
          <Text key={line} style={styles.consentLine}>• {line}</Text>
        ))}
        <TouchableOpacity
          style={[styles.next, (!consent || submitting) && styles.disabled]}
          disabled={!consent || submitting}
          onPress={submitWithConsent}
        >
          <Text style={styles.nextText}>{submitting ? 'Sending…' : 'I agree — send to our clinicians'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={back} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const selected = values[current.id] ?? [];
  const toggle = (value: string) => {
    const option = current.options?.find((o) => o.value === value);
    if (selected.includes(value)) return setValues({ ...values, [current.id]: selected.filter((v) => v !== value) });
    const exclusive = new Set(current.options?.filter((o) => o.exclusive).map((o) => o.value));
    setValues({ ...values, [current.id]: option?.exclusive ? [value] : [...selected.filter((v) => !exclusive.has(v)), value] });
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.progress}>{history.length + 1} / {visibleCount}</Text>
      <Text style={styles.title}>{current.text}</Text>
      {current.help ? <Text style={styles.sub}>{current.help}</Text> : null}

      {current.type === 'single' && current.options?.map((o) => (
        <TouchableOpacity key={o.value} style={styles.option} onPress={() => answer([o.value])} disabled={submitting}>
          <Text style={styles.optionText}>{o.label}</Text>
        </TouchableOpacity>
      ))}

      {current.type === 'multi' && (
        <>
          {current.options?.map((o) => (
            <TouchableOpacity
              key={o.value}
              style={[styles.option, selected.includes(o.value) && styles.optionSelected]}
              onPress={() => toggle(o.value)}
            >
              <Text style={styles.optionText}>{selected.includes(o.value) ? '✓ ' : ''}{o.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.next, !selected.length && styles.disabled]} disabled={!selected.length} onPress={() => answer(selected)}>
            <Text style={styles.nextText}>Next</Text>
          </TouchableOpacity>
        </>
      )}

      {(current.type === 'number' || current.type === 'text') && (
        <>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, current.type === 'text' && styles.multiline]}
              value={draft}
              onChangeText={setDraft}
              keyboardType={current.type === 'number' ? 'decimal-pad' : 'default'}
              multiline={current.type === 'text'}
              autoFocus
            />
            {current.unit ? <Text style={styles.unit}>{current.unit}</Text> : null}
          </View>
          <TouchableOpacity
            style={[styles.next, !current.optional && !draft.trim() && styles.disabled]}
            disabled={!current.optional && !draft.trim()}
            onPress={() => answer(draft.trim() ? [draft.trim()] : [])}
          >
            <Text style={styles.nextText}>{draft.trim() || !current.optional ? 'Next' : 'Skip'}</Text>
          </TouchableOpacity>
        </>
      )}

      {history.length > 0 && (
        <TouchableOpacity onPress={back} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: '#f9fafb', width: '100%', alignSelf: 'center', maxWidth: 720 },
  title: { fontSize: 20, fontWeight: '600', color: '#111827', marginBottom: 12, lineHeight: 28 },
  sub: { fontSize: 15, color: '#6b7280', marginBottom: 24 },
  progress: { fontSize: 12, color: '#9ca3af', marginBottom: 12 },
  option: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 16, marginBottom: 12 },
  optionSelected: { borderColor: '#0d9488', backgroundColor: '#f0fdf9' },
  optionText: { fontSize: 15, color: '#111827' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  input: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 14, fontSize: 16 },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  unit: { fontSize: 15, color: '#6b7280' },
  next: { backgroundColor: '#0d9488', borderRadius: 10, padding: 16, alignItems: 'center' },
  nextText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  back: { marginTop: 16, alignItems: 'center' },
  backText: { color: '#6b7280', fontSize: 14 },
  consentLine: { fontSize: 14, color: '#374151', marginBottom: 10, lineHeight: 20 },
});
