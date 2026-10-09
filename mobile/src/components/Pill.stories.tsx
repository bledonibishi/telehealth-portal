import type { Meta, StoryObj } from '@storybook/react-native';
import { Pill } from './ui';

const meta = {
  title: 'Components/Pill',
  component: Pill,
  args: { label: 'Approved' },
  argTypes: { tone: { control: 'select', options: ['plain', 'good', 'warn', 'danger', 'info'] } },
} satisfies Meta<typeof Pill>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
export const Good: Story = { args: { tone: 'good' } };
export const Warn: Story = { args: { tone: 'warn', label: 'Needs review' } };
export const Danger: Story = { args: { tone: 'danger', label: 'Declined' } };
export const Info: Story = { args: { tone: 'info', label: 'In progress' } };
