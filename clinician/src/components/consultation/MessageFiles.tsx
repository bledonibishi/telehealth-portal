'use client';

import { useState } from 'react';
import AuthedImage from '@/components/AuthedImage';
import { InlineError } from '@/components/ui/Alert';
import { filePath, openAuthedFile } from '@/lib/files';

export type MessageFile = { id: string; filename: string; mimeType: string };

/** The files a patient sent with a message: pictures as thumbnails that open full size, a PDF as a chip. Opening one is recorded in the audit log. */
export function MessageFiles({ files }: { files?: MessageFile[] }) {
  const [error, setError] = useState<unknown>(null);
  if (!files?.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {files.map((f) =>
        f.mimeType.startsWith('image/') ? (
          <button key={f.id} type="button" onClick={() => openAuthedFile(filePath(f.id)).catch(setError)} className="block rounded-md overflow-hidden border border-gray-200" aria-label={f.filename}>
            <AuthedImage path={filePath(f.id)} alt={f.filename} className="w-32 h-24 object-cover" />
          </button>
        ) : (
          <button key={f.id} type="button" onClick={() => openAuthedFile(filePath(f.id)).catch(setError)} className="text-xs font-medium rounded-md px-2.5 py-1.5 underline bg-white text-brand-900 border border-gray-200">
            📄 {f.filename}
          </button>
        ),
      )}
      <InlineError error={error} size="xs" />
    </div>
  );
}
