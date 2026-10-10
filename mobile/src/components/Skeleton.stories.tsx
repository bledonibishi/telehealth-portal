import React from 'react';
import { View } from 'react-native';
import type { Meta, StoryObj } from '@storybook/react-native';
import { LoadingState, Skeleton, SkeletonCard, SkeletonRows, SkeletonText } from './Skeleton';

// Placeholders for content that is loading. Use a skeleton when the shape of what is coming is known (a card, a list),
// a LoadingState when it is not. They pulse together, and stay still when the phone's "reduce motion" is on.
const meta = {
  title: 'Components/Skeleton',
  component: Skeleton,
  args: { width: '60%', height: 14 },
  decorators: [(Story) => <View style={{ padding: 16 }}><Story /></View>],
} satisfies Meta<typeof Skeleton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Block: Story = {};
export const Circle: Story = { args: { width: 48, height: 48, radius: 24 } };
export const Text3Lines: Story = { render: () => <SkeletonText lines={3} /> };
export const Card3Lines: Story = { render: () => <SkeletonCard lines={3} /> };
export const Rows: Story = { render: () => <SkeletonRows rows={4} /> };
export const Spinner: Story = { render: () => <LoadingState label="Loading your orders…" /> };
