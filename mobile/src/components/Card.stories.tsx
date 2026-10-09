import React from 'react';
import { Text } from 'react-native';
import type { Meta, StoryObj } from '@storybook/react-native';
import { Button, Card, CardTitle, Pill } from './ui';

const meta = {
  title: 'Components/Card',
  component: Card,
  argTypes: { tone: { control: 'select', options: ['plain', 'warn', 'danger', 'good', 'info'] } },
  args: {
    children: (
      <>
        <CardTitle title="Your next dose" subtitle="Thursday, 08:00" right={<Pill label="Due soon" tone="warn" />} />
        <Text style={{ marginVertical: 12 }}>Inject once a week, on the same day.</Text>
        <Button label="Log dose" onPress={() => {}} />
      </>
    ),
  },
} satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
export const Warn: Story = { args: { tone: 'warn' } };
export const Danger: Story = { args: { tone: 'danger' } };
export const Good: Story = { args: { tone: 'good' } };
export const Info: Story = { args: { tone: 'info' } };
