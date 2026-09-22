import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
} from 'react-native';
import { useMutation } from '@apollo/client';
import { SUBMIT_INTAKE_QUIZ } from '../../graphql/operations';
import { ConsultationKind } from '@telehealth/shared-types';

type QuizStep = { questionId: string; question: string; type: 'yesno' | 'select'; options?: string[] };

const HRT_QUESTIONS: QuizStep[] = [
  { questionId: 'active_cancer', question: 'Have you been diagnosed with any active cancer?', type: 'yesno' },
  { questionId: 'blood_clots_history', question: 'Do you have a history of blood clots (DVT or pulmonary embolism)?', type: 'yesno' },
  { questionId: 'unexplained_bleeding', question: 'Are you experiencing unexplained vaginal bleeding?', type: 'yesno' },
  { questionId: 'recent_heart_attack', question: 'Have you had a heart attack or stroke in the last 12 months?', type: 'yesno' },
  { questionId: 'liver_disease', question: 'Do you have liver disease?', type: 'yesno' },
  { questionId: 'uncontrolled_hypertension', question: 'Do you have uncontrolled high blood pressure?', type: 'yesno' },
  { questionId: 'main_symptoms', question: 'What are your main symptoms?', type: 'select', options: ['Hot flushes', 'Night sweats', 'Mood changes', 'Sleep problems', 'Brain fog', 'Joint pain', 'Multiple'] },
  { questionId: 'last_period', question: 'When was your last period?', type: 'select', options: ['Within the last 12 months', '1–2 years ago', 'More than 2 years ago', 'Never had one / Post-surgical'] },
];

export function IntakeQuizScreen({ navigation }: any) {
  const [kind, setKind] = useState<ConsultationKind | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Array<{ questionId: string; question: string; answer: string }>>([]);

  const questions = kind === ConsultationKind.HRT ? HRT_QUESTIONS : [];
  const current = questions[step];

  const [submit, { loading }] = useMutation(SUBMIT_INTAKE_QUIZ, {
    onCompleted() {
      Alert.alert('Submitted', 'Your consultation has been submitted and is under review.', [
        { text: 'OK', onPress: () => navigation.navigate('Status') },
      ]);
    },
    onError(e) {
      Alert.alert('Cannot process', e.message);
    },
  });

  const handleAnswer = (answer: string) => {
    const updated = [...answers, { questionId: current.questionId, question: current.question, answer }];
    setAnswers(updated);

    if (step + 1 < questions.length) {
      setStep(step + 1);
    } else {
      submit({ variables: { input: { kind, answers: updated } } });
    }
  };

  if (!kind) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Start a consultation</Text>
        <Text style={styles.sub}>What type of treatment are you seeking?</Text>
        <TouchableOpacity style={styles.option} onPress={() => setKind(ConsultationKind.HRT)}>
          <Text style={styles.optionText}>HRT — Hormone Replacement Therapy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.option} onPress={() => setKind(ConsultationKind.GLP1)}>
          <Text style={styles.optionText}>GLP-1 — Weight management</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (questions.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Coming soon</Text>
        <Text style={styles.sub}>GLP-1 intake quiz is not yet available.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.progress}>{step + 1} / {questions.length}</Text>
      <Text style={styles.title}>{current.question}</Text>

      {current.type === 'yesno' && (
        <View style={styles.row}>
          <TouchableOpacity style={[styles.option, styles.half]} onPress={() => handleAnswer('yes')}>
            <Text style={styles.optionText}>Yes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.option, styles.half]} onPress={() => handleAnswer('no')}>
            <Text style={styles.optionText}>No</Text>
          </TouchableOpacity>
        </View>
      )}

      {current.type === 'select' && current.options?.map((opt) => (
        <TouchableOpacity key={opt} style={styles.option} onPress={() => handleAnswer(opt)} disabled={loading}>
          <Text style={styles.optionText}>{opt}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: '#f9fafb' },
  title: { fontSize: 20, fontWeight: '600', color: '#111827', marginBottom: 24, lineHeight: 28 },
  sub: { fontSize: 15, color: '#6b7280', marginBottom: 24 },
  progress: { fontSize: 12, color: '#9ca3af', marginBottom: 12 },
  option: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 16, marginBottom: 12 },
  optionText: { fontSize: 15, color: '#111827' },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
});
