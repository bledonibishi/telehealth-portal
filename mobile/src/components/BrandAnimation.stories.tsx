import type { Meta, StoryObj } from '@storybook/react-native';
import { BrandAnimation } from './BrandAnimation';

const meta = {
  title: 'Components/BrandAnimation',
  component: BrandAnimation,
  args: { height: 110, showCaption: true },
} satisfies Meta<typeof BrandAnimation>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Large: Story = { args: { height: 220 } };
export const NoCaption: Story = { args: { showCaption: false } };
