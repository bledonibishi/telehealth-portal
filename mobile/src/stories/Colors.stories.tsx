import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { Meta, StoryObj } from '@storybook/react-native';
import { colors } from '../theme';

const meta = { title: 'Foundations/Colors', component: View } satisfies Meta<typeof View>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Every colour in theme.ts. Use these names in code; never a raw hex. */
export const Palette: Story = {
  render: () => (
    <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {Object.entries(colors).filter(([, v]) => typeof v === 'string').map(([name, value]) => (
        <View key={name} style={{ width: 96 }}>
          <View style={{ height: 48, borderRadius: 8, backgroundColor: value as string, borderWidth: 1, borderColor: '#e2e8f0' }} />
          <Text style={{ fontSize: 11, marginTop: 4, fontWeight: '600' }}>{name}</Text>
          <Text style={{ fontSize: 10, color: '#64748b' }}>{value as string}</Text>
        </View>
      ))}
    </ScrollView>
  ),
};
