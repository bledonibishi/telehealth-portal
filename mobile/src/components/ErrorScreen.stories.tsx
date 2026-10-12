import type { Meta, StoryObj } from '@storybook/react-native';
import { ErrorScreen } from './ErrorBoundary';

const meta = {
  title: 'Feedback/ErrorScreen',
  component: ErrorScreen,
  args: { onRetry: () => {} },
} satisfies Meta<typeof ErrorScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Shown by ErrorBoundary in place of a screen that crashed. */
export const Default: Story = {};
