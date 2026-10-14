import React from 'react';
import { View } from 'react-native';
import type { Meta, StoryObj } from '@storybook/react-native';
import { ChatBubble } from './ChatBubble';

const meta = {
  title: 'Components/ChatBubble',
  component: ChatBubble,
  args: { mine: false, text: 'Hello! How can we help you today?', sentAt: '2026-10-14T10:32:00Z' },
  decorators: [(Story) => <View style={{ padding: 16, gap: 8 }}><Story /></View>],
} satisfies Meta<typeof ChatBubble>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FromTheTeam: Story = {};
export const FromMe: Story = { args: { mine: true, text: 'Where is my order?' } };
export const FromTheAssistant: Story = { args: { assistant: true, text: 'Open Orders to see each order’s stage and its tracking number.' } };
export const WithFile: Story = { args: { mine: true, text: '', files: [{ id: 'f-1', filename: 'error.pdf', mimeType: 'application/pdf' }] } };
export const Long: Story = { args: { text: 'Open Settings and use “Manage subscription”. It opens our payment provider, where you can update your card, see and download invoices, pause or cancel. Did that solve it? Reply here and tell me.' } };
