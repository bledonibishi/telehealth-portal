import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { useMutation } from '@apollo/client';
import { ADD_MY_WEIGHT } from '../../graphql/portal';
import { Button, ErrorText, Field } from '../ui';

const MIN_KG = 30;
const MAX_KG = 300;
const requestId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Records a weight now. The request id stays the same across retries of one submission, so a double tap records it once. */
export function LogWeightForm({ onSaved }: { onSaved: () => void }) {
  const [weight, setWeight] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const id = useRef(requestId());
  const [save, { loading }] = useMutation(ADD_MY_WEIGHT, { refetchQueries: ['MyWeightJourney', 'MyWeightTimeline', 'MyWeightTrend'], awaitRefetchQueries: true });

  const submit = async () => {
    const n = Number(weight.replace(',', '.'));
    if (!weight.trim() || !Number.isFinite(n)) return setProblem('Please enter your weight.');
    if (n < MIN_KG || n > MAX_KG) return setProblem(`Please enter a weight between ${MIN_KG} and ${MAX_KG} kg.`);
    setProblem(null);
    try {
      await save({ variables: { input: { weightKg: n, measuredAt: new Date().toISOString(), clientRequestId: id.current } } });
      onSaved();
    } catch (e: any) {
      setProblem(e?.message ?? 'Couldn’t save that. Please try again.');
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <Field label="Weight (kg)" placeholder="e.g. 109.4" keyboardType="decimal-pad" value={weight} onChangeText={setWeight} autoFocus />
      <ErrorText>{problem}</ErrorText>
      <Button label="Save weight" onPress={submit} loading={loading} />
    </View>
  );
}
