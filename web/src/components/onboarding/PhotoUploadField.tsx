'use client';

import { useRef, useState } from 'react';
import { uploadFile, UploadKind } from '@/lib/upload';

export default function PhotoUploadField({
  kind,
  label,
  hint,
  onUploaded,
}: {
  kind: UploadKind;
  label: string;
  hint?: string;
  onUploaded: (fileId: string) => void;
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    setStatus('uploading');
    setError('');
    try {
      const fileId = await uploadFile(kind, file);
      setStatus('done');
      onUploaded(fileId);
    } catch (err: any) {
      setStatus('error');
      setError(err.message ?? 'Upload failed');
    }
  };

  return (
    <div className="border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-medium text-slate-900">{label}</p>
          {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
        </div>
        {status === 'done' && (
          <span className="text-xs font-medium text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full">✓ Uploaded</span>
        )}
      </div>

      {previewUrl ? (
        <div className="relative">
          <img src={previewUrl} alt={label} className="w-full max-h-64 object-cover rounded-xl border border-slate-100" />
          {status === 'uploading' && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-xl">
              <span className="text-xs text-slate-500">Uploading…</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setPreviewUrl(null);
              setStatus('idle');
            }}
            className="mt-2 text-xs text-slate-400 hover:text-slate-600"
          >
            Retake
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="flex-1 px-3 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Take photo
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 px-3 py-2.5 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
          >
            Upload file
          </button>
        </div>
      )}

      {error && <p className="text-xs text-danger-500 mt-2">{error}</p>}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
