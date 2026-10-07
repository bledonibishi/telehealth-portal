/**
 * The injection how-to video, set per deployment (NEXT_PUBLIC_INJECTION_VIDEO_URL) so the right clinical video
 * can be chosen without a code change. Only YouTube links are accepted, and they are shown through the
 * privacy-enhanced player. Anything else (or nothing) means no video yet.
 */
export function youtubeEmbedUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (url.pathname.startsWith('/embed/')) id = url.pathname.split('/')[2];
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

export const INJECTION_VIDEO_EMBED = youtubeEmbedUrl(process.env.NEXT_PUBLIC_INJECTION_VIDEO_URL);
