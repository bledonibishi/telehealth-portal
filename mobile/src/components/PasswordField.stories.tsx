import type { Meta, StoryObj } from '@storybook/react-native';
import { colors } from '../theme';
import { PasswordField } from './PasswordField';

const meta = {
  title: 'Components/PasswordField',
  component: PasswordField,
  args: {
    placeholder: 'Password',
    style: { borderWidth: 1, borderColor: colors.slate300, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, fontSize: 15, backgroundColor: colors.white },
  },
} satisfies Meta<typeof PasswordField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Filled: Story = { args: { value: 'correct-horse-battery' } };
