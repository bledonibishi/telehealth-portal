import React from 'react';
import { View } from 'react-native';
import type { Meta, StoryObj } from '@storybook/react-native';
import { GuideOverlay } from './GuideOverlay';
import { Card, CardTitle } from '../ui';

// A stand-in screen behind the overlay, 360 × 640, with the card the step points at.
const SCREEN = { width: 360, height: 640 };
const TARGET = { x: 16, y: 120, width: 328, height: 76 };

const meta = {
  title: 'Components/GuideOverlay',
  component: GuideOverlay,
  decorators: [
    (Story) => (
      <View style={{ width: SCREEN.width, height: SCREEN.height, alignSelf: 'center' }}>
        <View style={{ position: 'absolute', left: TARGET.x, top: TARGET.y, width: TARGET.width }}>
          <Card><CardTitle title="Your next step" subtitle="Your doctor is reviewing your answers." /></Card>
        </View>
        <Story />
      </View>
    ),
  ],
  args: {
    rect: TARGET,
    screen: SCREEN,
    tourTitle: 'Home',
    title: 'Your next step',
    body: 'What happens next in your treatment, and what to do if it is up to you.',
    n: 2,
    total: 3,
    first: false,
    last: false,
    onBack: () => {},
    onNext: () => {},
    onClose: () => {},
  },
} satisfies Meta<typeof GuideOverlay>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PointingAtSomething: Story = {};
export const FirstStep: Story = { args: { n: 1, first: true } };
export const LastStep: Story = { args: { n: 3, last: true, title: 'Your medicine', body: 'What you’re taking, when your next dose is due and how many repeats are left.' } };
/** A step with nothing to point at sits in the middle. */
export const Explanation: Story = { args: { rect: null, n: 1, total: 7, first: true, tourTitle: 'Tour of the app', title: 'Welcome', body: 'This guide shows you around the app, one part at a time. Tap Next to go on, or Close to stop.' } };
/** Near the bottom (a tab), the card goes above. */
export const NearTheBottom: Story = { args: { rect: { x: 288, y: 584, width: 72, height: 56 }, title: 'More', body: 'Notifications, your doctor, orders and payments, side effects, and your account.' } };
