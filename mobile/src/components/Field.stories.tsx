import type { Meta, StoryObj } from '@storybook/react-native';
import { Field } from './ui';

const meta = {
  title: 'Components/Field',
  component: Field,
  args: { label: 'Weight (kg)', placeholder: 'e.g. 82.5', keyboardType: 'decimal-pad' },
} satisfies Meta<typeof Field>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithHint: Story = { args: { hint: 'Weigh yourself in the morning, before eating.' } };
export const Filled: Story = { args: { value: '82.5' } };
