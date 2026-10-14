import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import { ChatComposer } from './ChatComposer';
import type { Attachment } from './AttachmentsField';

const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';

const meta = {
  title: 'Components/ChatComposer',
  component: ChatComposer,
  args: { value: '', onChangeText: () => {}, onSend: () => {}, files: [], onFilesChange: () => {}, note: 'In a medical emergency, call your local emergency number instead of using chat.', bottomInset: false },
} satisfies Meta<typeof ChatComposer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const WithText: Story = { args: { value: 'Where is my order?' } };
export const WithPicture: Story = { args: { files: [{ id: 'f-1', uri: PIXEL, name: 'screenshot.png' }] } };
export const Sending: Story = { args: { value: 'Where is my order?', sending: true } };
export const WithError: Story = { args: { value: 'Hello', problem: new Error('boom') } };
export const Interactive: Story = {
  render: (args) => {
    const [value, setValue] = useState('');
    const [files, setFiles] = useState<Attachment[]>([]);
    return <ChatComposer {...args} value={value} onChangeText={setValue} files={files} onFilesChange={setFiles} onSend={() => { setValue(''); setFiles([]); }} />;
  },
};
