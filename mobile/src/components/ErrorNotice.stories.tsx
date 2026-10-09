import type { Meta, StoryObj } from '@storybook/react-native';
import { ApiError, ErrorCode } from '@telehealth/shared-types';
import { Button } from './ui';
import { ErrorNotice } from './ErrorNotice';

const meta = {
  title: 'Feedback/ErrorNotice',
  component: ErrorNotice,
  args: { error: ApiError.of(ErrorCode.NOT_FOUND, 'That appointment wasn’t found'), onRetry: () => {} },
} satisfies Meta<typeof ErrorNotice>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Not retryable, so no "Try again" even with onRetry. */
export const NotRetryable: Story = {};
export const WithTitle: Story = { args: { title: 'We couldn’t load your orders', error: ApiError.of(ErrorCode.INTERNAL) } };
export const Warning: Story = { args: { error: ApiError.of(ErrorCode.CONFLICT, 'This order has already shipped') } };
export const OfflineWithRetry: Story = { args: { title: 'You seem to be offline', error: new TypeError('Network request failed') } };
export const RateLimited: Story = { args: { error: ApiError.of(ErrorCode.RATE_LIMITED) } };
export const WithAction: Story = {
  args: {
    error: ApiError.of(ErrorCode.LINK_INVALID_OR_EXPIRED),
    action: <Button label="Get a new link" variant="link" onPress={() => {}} />,
  },
};
