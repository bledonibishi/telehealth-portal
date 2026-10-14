/**
 * The cards on the patient's home screen, and how a patient may arrange them. The list lives here so the website, the phone
 * and the server agree on which cards exist, where each can go and which can never be taken off.
 *
 * A saved layout is only ever the patient's choices: the order of the cards they use and which ones they have taken off.
 * `normalizeLayout` turns whatever was saved into a complete, valid layout: a card added to the app later appears at the
 * end of its place by itself, a card that no longer exists is dropped, and a card marked `required` is always shown.
 */
export type DashboardZone = 'top' | 'main' | 'side';

/** How big a card is in the wide column: a third or half of the row, or all of it. Only some cards can change size. */
export type DashboardSize = 'small' | 'medium' | 'large';
export const DASHBOARD_SIZES: DashboardSize[] = ['small', 'medium', 'large'];

export interface DashboardWidget {
  id: string;
  /** What the patient sees in the "add a card" list. */
  title: string;
  description: string;
  /** Where it sits to begin with. */
  zone: DashboardZone;
  /** Everywhere it can go. A wide card (the treatment plan) needs the wide column; a small one can sit in either. */
  zones: DashboardZone[];
  /** The sizes the patient can choose between, smallest first. A card with no list (or one size) keeps its size. */
  sizes?: DashboardSize[];
  /** The size it starts at, when it has a choice. */
  defaultSize?: DashboardSize;
  /** Support may not hide this card from a patient: it holds treatment or safety information. (The patient may still arrange it as they like.) */
  staffCannotHide?: boolean;
  /** Asked before the card is taken off, when taking it off deserves a second thought. */
  confirmHide?: string;
  /** Cannot be taken off. No card is at the moment: a patient may arrange the whole screen as they like. */
  required?: boolean;
}

const ANYWHERE: DashboardZone[] = ['top', 'main', 'side'];
const ALL_SIZES: DashboardSize[] = ['small', 'medium', 'large'];

export const DASHBOARD_WIDGETS: DashboardWidget[] = [
  { id: 'progress', title: 'Progress at a glance', description: 'Your weight, doses and next steps in a row of small tiles', zone: 'top', zones: ANYWHERE, sizes: ALL_SIZES, defaultSize: 'large' },
  { id: 'plan', staffCannotHide: true, title: 'Current treatment plan', description: 'Your medicine and what comes next', zone: 'main', zones: ANYWHERE, sizes: ALL_SIZES, defaultSize: 'large' },
  { id: 'treatment', staffCannotHide: true, title: 'Treatment details', description: 'Your dose, schedule and timeline', zone: 'main', zones: ANYWHERE, sizes: ALL_SIZES, defaultSize: 'large' },
  { id: 'updates', title: 'Recent updates', description: 'Replies, decisions and order news', zone: 'main', zones: ANYWHERE, sizes: ALL_SIZES, defaultSize: 'small' },
  { id: 'orders', title: 'Recent orders', description: 'Your latest deliveries and tracking', zone: 'main', zones: ANYWHERE, sizes: ALL_SIZES, defaultSize: 'small' },
  { id: 'quickLinks', title: 'Quick links', description: 'Shortcuts to the pages you use most', zone: 'main', zones: ANYWHERE, sizes: ALL_SIZES, defaultSize: 'small' },
  { id: 'profile', title: 'Profile summary', description: 'Your details and progress numbers', zone: 'side', zones: ANYWHERE, sizes: ALL_SIZES, defaultSize: 'small' },
  { id: 'chat', title: 'Chat with us', description: 'A shortcut to your messages', zone: 'side', zones: ANYWHERE, sizes: ALL_SIZES, defaultSize: 'small' },
  { id: 'appointment', title: 'Appointments', description: 'Book or see your appointments', zone: 'side', zones: ANYWHERE, sizes: ALL_SIZES, defaultSize: 'small' },
  {
    id: 'emergency', staffCannotHide: true, title: 'In an emergency', description: 'What to do if you feel very unwell', zone: 'side', zones: ANYWHERE, sizes: ALL_SIZES, defaultSize: 'small',
    confirmHide: 'This card tells you what to do if you feel very unwell. The same advice is always shown under the message box in Help & messages. Remove it from your home screen anyway?',
  },
  { id: 'contact', title: 'Contact us', description: 'Ways to reach the clinic', zone: 'side', zones: ANYWHERE, sizes: ALL_SIZES, defaultSize: 'small' },
];

export interface DashboardLayout {
  /** The cards in each place, in the order they are shown. */
  top: string[];
  main: string[];
  side: string[];
  /** Cards the patient has taken off, available to add back. */
  hidden: string[];
  /** The size of each card the patient has resized; the others are at their own size. */
  sizes: Record<string, DashboardSize>;
}

const byId = new Map(DASHBOARD_WIDGETS.map((w) => [w.id, w]));

/** Everything shown, in the app's own order. */
export function defaultLayout(): DashboardLayout {
  const inZone = (zone: DashboardZone) => DASHBOARD_WIDGETS.filter((w) => w.zone === zone).map((w) => w.id);
  return { top: inZone('top'), main: inZone('main'), side: inZone('side'), hidden: [], sizes: {} };
}

/** A saved layout (or nothing) made complete and valid. Never throws, whatever it is given. */
export function normalizeLayout(saved: unknown): DashboardLayout {
  const raw = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>;
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const seen = new Set<string>();
  const keep = (ids: string[], zone: DashboardZone) => ids.filter((id) => {
    const w = byId.get(id);
    if (!w || !w.zones.includes(zone) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const placed: Record<DashboardZone, string[]> = { top: keep(list(raw.top), 'top'), main: keep(list(raw.main), 'main'), side: keep(list(raw.side), 'side') };
  // Hidden: only cards that may be hidden, and that were not also placed.
  const hidden = list(raw.hidden).filter((id) => {
    const w = byId.get(id);
    if (!w || w.required || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  // Anything not mentioned (a new card, or one a patient never touched) is shown at the end of its place.
  for (const w of DASHBOARD_WIDGETS) if (!seen.has(w.id)) placed[w.zone].push(w.id);
  // Sizes: only for cards that can be resized, and only to a size they offer.
  const sizes: Record<string, DashboardSize> = {};
  const rawSizes = raw.sizes && typeof raw.sizes === 'object' ? (raw.sizes as Record<string, unknown>) : {};
  for (const [id, size] of Object.entries(rawSizes)) {
    const w = byId.get(id);
    if (w?.sizes?.includes(size as DashboardSize)) sizes[id] = size as DashboardSize;
  }
  return { ...placed, hidden, sizes };
}

/** The size a card is shown at: the patient's choice, else its own default (and null for a card that cannot be resized). */
export function sizeOf(layout: DashboardLayout, id: string): DashboardSize | null {
  const w = byId.get(id);
  if (!w?.sizes || w.sizes.length < 2) return null;
  return layout.sizes[id] ?? w.defaultSize ?? w.sizes[0];
}

/**
 * Something support has done to one patient's home screen: hidden a card for a while (to simplify it, or because the patient
 * asked), or shown one the patient had taken off. It ends by itself on `until`, and the patient's own arrangement is untouched.
 */
export interface DashboardOverride {
  id: string;
  mode: 'HIDE' | 'SHOW';
  /** ISO time it ends. */
  until: string;
  reason: string;
  byId: string;
  at: string;
}

/** The overrides still in force. */
export function activeOverrides(overrides: unknown, now = new Date()): DashboardOverride[] {
  if (!Array.isArray(overrides)) return [];
  return overrides.filter((o): o is DashboardOverride => !!o && typeof o === 'object' && typeof (o as DashboardOverride).id === 'string' && ((o as DashboardOverride).mode === 'HIDE' || (o as DashboardOverride).mode === 'SHOW') && new Date((o as DashboardOverride).until).getTime() > now.getTime() && byId.has((o as DashboardOverride).id));
}

/**
 * The layout the patient sees: their own arrangement, with support's holds applied. A card support has hidden is taken out
 * (and cannot be added back until the hold ends); a card support has shown comes back if the patient had removed it.
 */
export function applyOverrides(layout: DashboardLayout, overrides: DashboardOverride[]): DashboardLayout & { staffHidden: Array<{ id: string; until: string }> } {
  const out: DashboardLayout = { top: [...layout.top], main: [...layout.main], side: [...layout.side], hidden: [...layout.hidden], sizes: { ...layout.sizes } };
  const staffHidden: Array<{ id: string; until: string }> = [];
  for (const o of overrides) {
    const w = byId.get(o.id);
    if (!w) continue;
    if (o.mode === 'HIDE' && !w.staffCannotHide) {
      for (const z of ['top', 'main', 'side'] as DashboardZone[]) out[z] = out[z].filter((x) => x !== o.id);
      out.hidden = out.hidden.filter((x) => x !== o.id);
      staffHidden.push({ id: o.id, until: o.until });
    } else if (o.mode === 'SHOW' && out.hidden.includes(o.id)) {
      out.hidden = out.hidden.filter((x) => x !== o.id);
      out[w.zone].push(o.id);
    }
  }
  return { ...out, staffHidden };
}
