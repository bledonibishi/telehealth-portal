import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { SegmentedControl } from './SegmentedControl';

const meta = {
  title: 'Components/SegmentedControl',
  component: SegmentedControl,
  args: { value: 'news', onChange: () => {}, options: [{ value: 'news', label: 'News' }, { value: 'todo', label: 'To do' }] },
} satisfies Meta<typeof SegmentedControl>;
export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ withCounts }: { withCounts?: boolean }) {
  const [value, setValue] = useState('news');
  return <SegmentedControl value={value} onChange={setValue} options={[{ value: 'news', label: 'News', count: withCounts ? 3 : undefined }, { value: 'todo', label: 'To do', count: withCounts ? 2 : undefined }]} />;
}

export const Plain: Story = { render: () => <Demo /> };
export const WithCounts: Story = { render: () => <Demo withCounts /> };
