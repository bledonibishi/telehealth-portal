import type { Meta, StoryObj } from '@storybook/react-native';
import { Button } from './ui';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: { label: 'Continue', onPress: () => {} },
  argTypes: { variant: { control: 'select', options: ['primary', 'soft', 'outline', 'danger', 'link'] } },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Soft: Story = { args: { variant: 'soft' } };
export const Outline: Story = { args: { variant: 'outline' } };
export const Danger: Story = { args: { variant: 'danger', label: 'Cancel order' } };
export const Link: Story = { args: { variant: 'link', label: 'Learn more' } };
export const Loading: Story = { args: { loading: true } };
export const Disabled: Story = { args: { disabled: true } };
export const Small: Story = { args: { small: true } };
