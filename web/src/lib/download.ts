import { format } from 'date-fns';
import { loadPhoto } from './photo-cache';
import { zipBytes, type ZipFile } from './zip';

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };

/** Hands a file to the browser to save, as a click on a download link would. */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export interface DownloadablePhoto { fileId: string; at: string; weightKg: number | null; label: string }

/** "progress-2026-10-08-week-2-98.4kg.jpg": sorts by date in a folder and says what it is. */
export function photoFileName(photo: DownloadablePhoto, type: string): string {
  const label = photo.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const weight = photo.weightKg === null ? '' : `-${Number(photo.weightKg.toFixed(1))}kg`;
  return `progress-${format(new Date(photo.at), 'yyyy-MM-dd')}${label ? `-${label}` : ''}${weight}.${EXTENSIONS[type] ?? 'jpg'}`;
}

/** Saves one photo exactly as it is stored. */
export async function downloadPhoto(photo: DownloadablePhoto): Promise<void> {
  const blob = await loadPhoto(photo.fileId);
  saveBlob(blob, photoFileName(photo, blob.type));
}

/** Saves every photo in one ZIP. Two photos from the same day and weight get "-2", "-3" so none is lost. */
export async function downloadAllPhotos(photos: DownloadablePhoto[]): Promise<void> {
  const used = new Map<string, number>();
  const files: ZipFile[] = [];
  for (const photo of photos) {
    const blob = await loadPhoto(photo.fileId);
    let name = photoFileName(photo, blob.type);
    const seen = (used.get(name) ?? 0) + 1;
    used.set(name, seen);
    if (seen > 1) name = name.replace(/(\.[a-z]+)$/, `-${seen}$1`);
    files.push({ name, data: new Uint8Array(await blob.arrayBuffer()), modifiedAt: new Date(photo.at) });
  }
  saveBlob(new Blob([zipBytes(files) as BlobPart], { type: 'application/zip' }), `progress-photos-${format(new Date(), 'yyyy-MM-dd')}.zip`);
}
