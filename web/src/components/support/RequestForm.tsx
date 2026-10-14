'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { CREATE_SUPPORT_REQUEST, MY_SUPPORT_REQUESTS } from '@/graphql/support';
import { Alert, InlineError } from '@/components/common/Alert';
import { btnBlue } from '@/components/portal/Card';
import { Icon } from '@/components/portal/Icon';
import { uploadFile } from '@/lib/upload';

export type Topic = 'TECHNICAL' | 'BILLING' | 'DELIVERY' | 'ACCOUNT' | 'CLINICAL' | 'OTHER';
type Attached = { id: string; name: string };
export type SentRequest = { id: string; number: number; type: Topic };

const MAX_FILES = 3;
const MAX_MB = 10;

const TOPICS: { value: Topic; label: string; hint: string }[] = [
  { value: 'TECHNICAL', label: 'The app or website', hint: 'Something isn’t working or won’t load' },
  { value: 'BILLING', label: 'Payments', hint: 'A charge, a receipt or my subscription' },
  { value: 'DELIVERY', label: 'My delivery', hint: 'Where my order is, or the address' },
  { value: 'ACCOUNT', label: 'My account', hint: 'Signing in, my details or my password' },
  { value: 'CLINICAL', label: 'A question for my doctor', hint: 'My medicine, side effects or how I feel' },
  { value: 'OTHER', label: 'Something else', hint: '' },
];

const inputCls = 'w-full text-sm text-slate-800 bg-white border border-slate-200 rounded-md px-3 py-2 placeholder:text-slate-400';

/** A written request for help: a topic, a few words, optional detail and files. It is read by the right team and answered in the chat. */
export function RequestForm({ onSent }: { onSent: (request: SentRequest) => void }) {
  const [topic, setTopic] = useState<Topic | null>(null);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [files, setFiles] = useState<Attached[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<unknown>(null);

  const [create, { loading }] = useMutation(CREATE_SUPPORT_REQUEST, {
    refetchQueries: [{ query: MY_SUPPORT_REQUESTS }],
    onError: setError,
    onCompleted: (d) => { setError(null); onSent(d.createSupportRequest); },
  });

  // Each file is sent to the server as soon as it is chosen, and only its id travels with the request.
  const addFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setUploadError(null);
    const chosen = Array.from(list).slice(0, MAX_FILES - files.length);
    if (chosen.some((f) => f.size > MAX_MB * 1024 * 1024)) {
      setUploadError(`Each file must be under ${MAX_MB} MB.`);
      return;
    }
    setUploading(true);
    try {
      const added: Attached[] = [];
      for (const f of chosen) added.push({ id: await uploadFile('SUPPORT_ATTACHMENT', f), name: f.name });
      setFiles((cur) => [...cur, ...added]);
    } catch (e) {
      setUploadError(e);
    } finally {
      setUploading(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (topic) create({ variables: { input: { type: topic, subject: subject.trim(), description: description.trim() || undefined, attachmentIds: files.map((f) => f.id) } } });
      }}
    >
      <p className="text-sm font-medium text-slate-900">What do you need help with?</p>
      <div className="grid sm:grid-cols-2 gap-2">
        {TOPICS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTopic(t.value)}
            aria-pressed={topic === t.value}
            className={`text-left rounded-md border px-3 py-2.5 transition-colors ${topic === t.value ? 'border-ink-600 bg-ink-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
          >
            <span className="block text-sm font-semibold text-slate-900">{t.label}</span>
            {t.hint && <span className="block text-xs text-slate-500 mt-0.5">{t.hint}</span>}
          </button>
        ))}
      </div>

      {topic && (
        <div className="space-y-3">
          {topic === 'CLINICAL' && (
            <Alert tone="warning" title="In an emergency, don’t wait for us">
              If you feel very unwell, have trouble breathing, chest pain or a severe reaction, call your local emergency number now. Requests here are read during working hours.
            </Alert>
          )}
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">In a few words</span>
            <input required value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} className={inputCls} placeholder="e.g. My parcel hasn’t arrived" />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">More detail (optional)</span>
            <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} className={inputCls} />
          </label>
          <div>
            <span className="block text-xs font-medium text-slate-600 mb-1">A screenshot or photo that shows the problem (optional)</span>
            {files.length > 0 && (
              <ul className="mb-2 space-y-1">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-md px-3 py-1.5">
                    <span className="truncate">{f.name}</span>
                    <button type="button" onClick={() => setFiles((cur) => cur.filter((x) => x.id !== f.id))} aria-label={`Remove ${f.name}`} className="shrink-0 text-xs font-medium text-slate-500 hover:text-slate-800">Remove</button>
                  </li>
                ))}
              </ul>
            )}
            {files.length < MAX_FILES && (
              <label className={`inline-flex items-center gap-2 text-sm font-medium text-ink-800 bg-ink-50 hover:bg-ink-100 rounded-md px-3 py-2 cursor-pointer ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
                <Icon name="clip" className="w-4 h-4" />
                {uploading ? 'Uploading…' : files.length ? 'Add another' : 'Attach a file'}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" multiple className="sr-only" onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
              </label>
            )}
            <p className="text-xs text-slate-400 mt-1.5">Up to {MAX_FILES} files, {MAX_MB} MB each: photos, screenshots or a PDF.</p>
            {topic !== 'CLINICAL' && (
              <p className="text-xs text-amber-700 mt-1">Please don’t send ID documents, prescriptions or test results here. For health questions choose “A question for my doctor”.</p>
            )}
            <InlineError error={uploadError} size="xs" className="mt-1" />
          </div>
          <InlineError error={error} />
          <button type="submit" disabled={loading || uploading || subject.trim().length < 3} className={btnBlue}>{loading ? 'Sending…' : 'Send request'}</button>
        </div>
      )}
    </form>
  );
}
