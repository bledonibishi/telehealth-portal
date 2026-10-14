import type { Meta, StoryObj } from '@storybook/react-native';
import { ProfileButton } from './ProfileButton';

const meta = {
  title: 'Components/ProfileButton',
  component: ProfileButton,
  args: { initials: 'AB', onPress: () => {} },
} satisfies Meta<typeof ProfileButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** Before the name has loaded. */
export const NoName: Story = { args: { initials: '' } };
