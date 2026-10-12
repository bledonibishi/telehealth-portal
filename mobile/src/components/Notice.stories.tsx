import type { Meta, StoryObj } from '@storybook/react-native';
import { Notice } from './ui';

const meta = {
  title: 'Components/Notice',
  component: Notice,
  args: { title: 'Heads up', children: 'Your photos are being reviewed. This usually takes a day.' },
  argTypes: { tone: { control: 'select', options: ['info', 'warn', 'danger', 'good'] } },
} satisfies Meta<typeof Notice>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {};
export const Warn: Story = { args: { tone: 'warn' } };
export const Danger: Story = { args: { tone: 'danger', title: 'Something went wrong' } };
export const Good: Story = { args: { tone: 'good', title: 'All set' } };
