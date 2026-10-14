import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { CREATE_SUPPORT_REQUEST, MY_SUPPORT_REQUESTS } from '../../graphql/portal';
import { AttachmentsField, type Attachment } from '../../components/AttachmentsField';
import { MenuRow } from '../../components/MenuRow';
import { Button, Card, CardTitle, Columns, Empty, ErrorText, Field, Notice, Pill, Screen } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { EMERGENCY_NUMBER } from '../../lib/config';
import { colors } from '../../theme';

type Topic = 'TECHNICAL' | 'BILLING' | 'DELIVERY' | 'ACCOUNT' | 'CLINICAL' | 'OTHER';
type Status = 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_PATIENT' | 'RESOLVED' | 'CLOSED';
type Request = { id: string; number: number; type: Topic; status: Status; subject: string; createdAt: string; attachments?: { id: string }[] };

const TOPICS: { value: Topic; icon: string; label: string; hint: string }[] = [
  { value: 'TECHNICAL', icon: '📱', label: 'The app or website', hint: 'Something isn’t working or won’t load' },
  { value: 'BILLING', icon: '💳', label: 'Payments', hint: 'A charge, a receipt or my subscription' },
  { value: 'DELIVERY', icon: '📦', label: 'My delivery', hint: 'Where my order is, or the address' },
  { value: 'ACCOUNT', icon: '👤', label: 'My account', hint: 'Signing in, my details or my password' },
  { value: 'CLINICAL', icon: '🩺', label: 'A question for my doctor', hint: 'My medicine, side effects or how I feel' },
  { value: 'OTHER', icon: '💬', label: 'Something else', hint: 'Anything that doesn’t fit above' },
];

const STATUS: Record<Status, { label: string; tone: 'plain' | 'good' | 'warn' | 'info' }> = {
  OPEN: { label: 'Received', tone: 'warn' },
  IN_PROGRESS: { label: 'We’re on it', tone: 'info' },
  WAITING_ON_PATIENT: { label: 'We need your reply', tone: 'warn' },
  RESOLVED: { label: 'Resolved', tone: 'good' },
  CLOSED: { label: 'Closed', tone: 'plain' },
};

/** Ask for help with the app, a payment, a delivery or the account (or put a question to the doctor), and follow what became of it. */
export function HelpScreen() {
  const { data, refetch, loading } = useQuery(MY_SUPPORT_REQUESTS, { fetchPolicy: 'cache-and-network' });
  const requests: Request[] = data?.mySupportRequests ?? [];
  const [topic, setTopic] = useState<Topic | null>(null);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sent, setSent] = useState<Request | null>(null);
  const [problem, setProblem] = useState<unknown>(null);

  const [create, { loading: sending }] = useMutation(CREATE_SUPPORT_REQUEST, { refetchQueries: [{ query: MY_SUPPORT_REQUESTS }] });

  const submit = async () => {
    if (!topic) return;
    setProblem(null);
    try {
      const res = await create({ variables: { input: { type: topic, subject: subject.trim(), description: description.trim() || undefined, attachmentIds: files.map((f) => f.id) } } });
      setSent(res.data.createSupportRequest);
      setTopic(null);
      setSubject('');
      setDescription('');
      setFiles([]);
    } catch (e) {
      setProblem(e);
    }
  };

  return (
    <Screen title="Help" subtitle="Tell us what you need and our team will get back to you." refreshing={loading} onRefresh={() => refetch()}>
      {sent && (
        <Notice tone="good" title={`Request #${sent.number} sent`}>
          {sent.type === 'CLINICAL' ? 'A doctor will read this. We’ll reply in your messages.' : 'Our team has it. We’ll reply in your messages.'}
        </Notice>
      )}
      <Columns>
        <Card style={{ padding: 6 }}>
          <View style={{ padding: 10 }}><CardTitle title="What do you need help with?" /></View>
          {TOPICS.map((t) => (
            <MenuRow key={t.value} icon={t.icon} label={t.label} hint={t.hint} selected={topic === t.value} onPress={() => { setTopic(t.value); setSent(null); }} />
          ))}
        </Card>

        {topic && (
          <Card>
            <CardTitle title="Your request" />
            {topic === 'CLINICAL' && (
              <Notice tone="warn" title="In an emergency, don’t wait for us">
                If you feel very unwell, have trouble breathing, chest pain or a severe reaction, call {EMERGENCY_NUMBER} now. Requests here are read during working hours.
              </Notice>
            )}
            <View style={{ gap: 14 }}>
              <Field label="In a few words" value={subject} onChangeText={setSubject} maxLength={160} placeholder="e.g. My parcel hasn’t arrived" />
              <Field label="More detail (optional)" value={description} onChangeText={setDescription} maxLength={4000} multiline numberOfLines={4} style={{ minHeight: 96, textAlignVertical: 'top' }} />
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.slate700 }}>A photo or screenshot that shows the problem (optional)</Text>
                <AttachmentsField kind="SUPPORT_ATTACHMENT" files={files} onChange={setFiles} onUploadingChange={setUploading} />
                {topic !== 'CLINICAL' && <Text style={{ fontSize: 12, color: colors.amber800 }}>Please don’t send ID documents, prescriptions or test results here. For health questions choose “A question for my doctor”.</Text>}
              </View>
              <ErrorText error={problem} />
              <Button label="Send request" loading={sending} disabled={subject.trim().length < 3 || uploading} onPress={submit} />
            </View>
          </Card>
        )}

        <Card>
          <CardTitle title="Your requests" />
          {requests.length === 0 ? (
            <Empty>You haven’t sent any requests yet.</Empty>
          ) : (
            requests.map((r) => (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink900 }}>{r.subject}</Text>
                  <Text style={{ fontSize: 12, color: colors.slate500, marginTop: 1 }}>
                    #{r.number} · {fmtDate(r.createdAt)}{r.attachments?.length ? ` · ${r.attachments.length} file${r.attachments.length === 1 ? '' : 's'}` : ''}
                  </Text>
                </View>
                <Pill label={STATUS[r.status].label} tone={STATUS[r.status].tone} />
              </View>
            ))
          )}
        </Card>
      </Columns>
    </Screen>
  );
}
