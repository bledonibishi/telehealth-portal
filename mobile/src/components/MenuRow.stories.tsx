import type { Meta, StoryObj } from '@storybook/react-native';
import { MenuRow } from './MenuRow';

const meta = {
  title: 'Components/MenuRow',
  component: MenuRow,
  args: { icon: '🩺', label: 'My Doctor', hint: 'Your care team, hours and recent appointments', onPress: () => {} },
} satisfies Meta<typeof MenuRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithCount: Story = { args: { icon: '🔔', label: 'Notifications', hint: '3 unread', badge: 3 } };
