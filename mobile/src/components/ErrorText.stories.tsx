import type { Meta, StoryObj } from '@storybook/react-native';
import { ApiError, ErrorCode } from '@telehealth/shared-types';
import { ErrorText } from './ui';

// ErrorText takes whatever failed and decides the message and colour, so each story passes a different kind of failure.
const meta = {
  title: 'Feedback/ErrorText',
  component: ErrorText,
  args: { error: 'Please enter a valid date of birth' },
} satisfies Meta<typeof ErrorText>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Message: Story = {};
export const FromTheApi: Story = { args: { error: ApiError.of(ErrorCode.WRONG_CURRENT_PASSWORD) } };
export const Warning: Story = { args: { error: ApiError.of(ErrorCode.RATE_LIMITED) } };
export const Offline: Story = { args: { error: new TypeError('Network request failed') } };
/** A bug's own text ("Cannot read properties of undefined") is never shown. */
export const Crash: Story = { args: { error: new TypeError('Cannot read properties of undefined (reading "id")') } };
export const NoError: Story = { args: { error: null } };
