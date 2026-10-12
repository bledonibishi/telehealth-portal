import React from 'react';
import { View } from 'react-native';
import type { Meta, StoryObj } from '@storybook/react-native';
import { ProgressBar, Stat } from './ui';

const meta = {
  title: 'Components/ProgressBar',
  component: ProgressBar,
  args: { percent: 40, label: 'Progress to goal' },
  argTypes: { percent: { control: { type: 'number', min: 0, max: 100 } } },
} satisfies Meta<typeof ProgressBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Done: Story = { args: { percent: 100 } };
export const WithStats: Story = {
  render: (args) => (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Stat label="Start" value="96.0 kg" />
        <Stat label="Now" value="88.4 kg" tone="good" />
        <Stat label="Goal" value="80.0 kg" />
      </View>
      <ProgressBar {...args} />
    </View>
  ),
};
