import { getToken } from './auth';

const GRAPHQL_URL = process.env.NEXT_PUBLIC_GRAPHQL_URL ?? 'http://localhost:4000/graphql';
const API_ROOT = GRAPHQL_URL.replace(/\/graphql$/, '');

/**
 * Opens an authenticated document (e.g. a prescription PDF) in a new tab. The
 * endpoint needs the JWT, so a plain link can't load it. The tab is opened
 * synchronously, inside the click, so popup blockers allow it.
 */
export function openAuthedDocument(path: string) {
  const tab = window.open('', '_blank');
  fetch(`${API_ROOT}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } })
    .then((res) => {
      if (!res.ok) throw new Error(`Could not load document (${res.status})`);
      return res.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else window.location.href = url;
      // Long enough for the tab to load it.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    })
    .catch((err) => {
      tab?.close();
      alert(err.message);
    });
}
