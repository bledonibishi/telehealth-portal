import type { Meta, StoryObj } from '@storybook/react-native';
import { CountBadge, NotificationRow } from './NotificationRow';

const meta = {
  title: 'Components/NotificationRow',
  component: NotificationRow,
  args: { title: 'New message from your care team', body: 'Open the chat to read it.', time: '5 min ago', unread: true, onPress: () => {} },
  argTypes: { tone: { control: 'select', options: ['info', 'success', 'warning', 'urgent'] } },
} satisfies Meta<typeof NotificationRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Unread: Story = {};
export const Read: Story = { args: { unread: false, time: '2 days ago' } };
export const Success: Story = { args: { icon: '📦', tone: 'success', title: 'Your order was delivered', body: 'Store it as the leaflet says.' } };
export const Warning: Story = { args: { icon: '⚠️', tone: 'warning', title: 'We couldn’t deliver your order', body: 'Open Orders to see what happens next.' } };
export const Grouped: Story = { args: { icon: '💬', title: '3 new messages from your care team' } };

export const Badge: StoryObj<typeof CountBadge> = { render: () => <CountBadge count={4} /> };
export const BadgeMany: StoryObj<typeof CountBadge> = { render: () => <CountBadge count={120} /> };
