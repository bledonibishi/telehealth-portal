const MAX_SIDE = 1600;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Gets a progress photo ready to upload: scaled down so it is quick to send, and re-drawn as a plain
 * JPEG, which also drops the location and camera details phones hide inside photos. If the browser
 * can't read the format (HEIC outside Safari), the original goes up as it is.
 */
export async function prepareProgressPhoto(file: File): Promise<File> {
  if (!ALLOWED.includes(file.type)) throw new Error('Please choose a photo (JPEG, PNG, WebP or HEIC).');
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (blob) return new File([blob], 'progress.jpg', { type: 'image/jpeg' });
  } catch {
    /* fall through to the original */
  }
  if (file.size > MAX_BYTES) throw new Error('That photo is too large — please choose one under 10 MB.');
  return file;
}
