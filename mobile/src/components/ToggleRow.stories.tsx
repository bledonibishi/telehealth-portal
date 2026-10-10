import type { Meta, StoryObj } from '@storybook/react-native';
import { ToggleRow } from './ToggleRow';

const meta = {
  title: 'Components/ToggleRow',
  component: ToggleRow,
  args: { label: 'Messages from your care team', hint: 'A notification when your doctor writes.', value: true, onValueChange: () => {} },
} satisfies Meta<typeof ToggleRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const On: Story = {};
export const Off: Story = { args: { value: false } };
export const Disabled: Story = { args: { disabled: true } };
export const NoHint: Story = { args: { hint: undefined } };
