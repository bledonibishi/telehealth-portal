import { getToken } from './auth';
import { API_ROOT } from './upload';

// The same photo is shown on a card, in the comparison and in the full-screen view. It is fetched
// once and kept in memory for the visit; nothing is written to the device.
const MAX_KEPT = 80;
const cache = new Map<string, Promise<Blob>>();

/** A private file (a progress photo) as bytes, fetched with the sign-in token. */
export function loadPhoto(fileId: string): Promise<Blob> {
  let pending = cache.get(fileId);
  if (!pending) {
    pending = fetch(`${API_ROOT}/uploads/${fileId}/file`, { headers: { Authorization: `Bearer ${getToken()}` } }).then((res) => {
      if (!res.ok) throw new Error('Couldn’t load that photo');
      return res.blob();
    });
    cache.set(fileId, pending);
    // A failed load is not remembered, so the next look tries again.
    pending.catch(() => cache.get(fileId) === pending && cache.delete(fileId));
    if (cache.size > MAX_KEPT) cache.delete(cache.keys().next().value as string);
  }
  return pending;
}

/** On sign-out: the next person at this browser must not be handed the last one's photos. */
export function forgetPhotos() {
  cache.clear();
}
