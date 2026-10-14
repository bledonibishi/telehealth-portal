import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import { AttachmentsField, type Attachment } from './AttachmentsField';

// A picture that needs no network, so the thumbnails show in Storybook.
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
const sample = (n: number): Attachment[] => Array.from({ length: n }, (_, i) => ({ id: `f-${i}`, uri: PIXEL, name: `screenshot-${i + 1}.png` }));

const meta = {
  title: 'Components/AttachmentsField',
  component: AttachmentsField,
  args: { kind: 'SUPPORT_ATTACHMENT', files: [], onChange: () => {} },
} satisfies Meta<typeof AttachmentsField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const OneFile: Story = { args: { files: sample(1) } };
export const Full: Story = { args: { files: sample(3) } };
export const Disabled: Story = { args: { disabled: true } };
/** Add and remove work here; picking a photo needs a device, and uploading needs the API. */
export const Interactive: Story = {
  render: (args) => {
    const [files, setFiles] = useState<Attachment[]>(sample(2));
    return <AttachmentsField {...args} files={files} onChange={setFiles} />;
  },
};
