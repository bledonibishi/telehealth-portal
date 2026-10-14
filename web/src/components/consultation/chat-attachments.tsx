'use client';

import { useState } from 'react';
import { AuthedImage } from '@/components/common/AuthedImage';
import { InlineError } from '@/components/common/Alert';
import { Icon } from '@/components/portal/Icon';
import { openAuthedFile, uploadFile } from '@/lib/upload';

export type ChatAttachment = { id: string; filename: string; mimeType: string };

export const MAX_CHAT_FILES = 3;
const MAX_MB = 10;

/** The files a patient has chosen for the message they are writing. Each is uploaded as soon as it is chosen; only its id is sent with the message. */
export function useChatAttachments() {
  const [files, setFiles] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const add = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setError(null);
    const chosen = Array.from(list).slice(0, MAX_CHAT_FILES - files.length);
    if (chosen.some((f) => f.size > MAX_MB * 1024 * 1024)) {
      setError(`Each file must be under ${MAX_MB} MB.`);
      return;
    }
    setUploading(true);
    try {
      const added: ChatAttachment[] = [];
      for (const f of chosen) added.push({ id: await uploadFile('SUPPORT_ATTACHMENT', f), filename: f.name, mimeType: f.type || 'application/octet-stream' });
      setFiles((cur) => [...cur, ...added]);
    } catch (e) {
      setError(e);
    } finally {
      setUploading(false);
    }
  };

  return { files, uploading, error, add, remove: (id: string) => setFiles((cur) => cur.filter((f) => f.id !== id)), reset: () => { setFiles([]); setError(null); }, restore: (list: ChatAttachment[]) => setFiles(list) };
}

/** The files chosen so far, above the message box, with a way to take each off again. */
export function AttachmentChips({ state }: { state: ReturnType<typeof useChatAttachments> }) {
  const { files, error, remove } = state;
  if (files.length === 0 && !error) return null;
  return (
    <div className="mb-2">
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-1.5 text-xs text-slate-700 bg-slate-100 rounded-md pl-2.5 pr-1 py-1 max-w-[220px]">
              <span className="truncate">{f.filename}</span>
              <button type="button" onClick={() => remove(f.id)} aria-label={`Remove ${f.filename}`} className="shrink-0 w-5 h-5 rounded text-slate-500 hover:bg-slate-200 hover:text-slate-800">✕</button>
            </li>
          ))}
        </ul>
      )}
      <InlineError error={error} size="xs" className="mt-1" />
    </div>
  );
}

/** The button next to the message box that chooses a photo, screenshot or PDF. */
export function AttachmentButton({ state }: { state: ReturnType<typeof useChatAttachments> }) {
  const { files, uploading, add } = state;
  const full = files.length >= MAX_CHAT_FILES;
  return (
    <label
      className={`shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer ${full || uploading ? 'opacity-40 pointer-events-none' : ''}`}
      title={full ? `Up to ${MAX_CHAT_FILES} files` : uploading ? 'Uploading…' : 'Attach a photo, screenshot or PDF'}
    >
      <Icon name="clip" className="w-5 h-5" />
      <span className="sr-only">Attach a file</span>
      <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" multiple className="sr-only" onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
    </label>
  );
}

/** The files sent with a message: pictures as small thumbnails that open full size, a PDF as a chip. */
export function MessageAttachments({ attachments, onDark = false }: { attachments?: ChatAttachment[]; onDark?: boolean }) {
  const [error, setError] = useState<unknown>(null);
  if (!attachments?.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {attachments.map((a) =>
        a.mimeType.startsWith('image/') ? (
          <button key={a.id} type="button" onClick={() => openAuthedFile(`/uploads/${a.id}/file`).catch(setError)} className="block rounded-md overflow-hidden border border-black/10" aria-label={`Open ${a.filename}`}>
            <AuthedImage fileId={a.id} alt={a.filename} className="w-32 h-24 object-cover" />
          </button>
        ) : (
          <button key={a.id} type="button" onClick={() => openAuthedFile(`/uploads/${a.id}/file`).catch(setError)} className={`text-xs font-medium rounded-md px-2.5 py-1.5 underline ${onDark ? 'bg-white/10 text-white' : 'bg-white text-ink-800 border border-slate-200'}`}>
            📄 {a.filename}
          </button>
        ),
      )}
      <InlineError error={error} size="xs" />
    </div>
  );
}
