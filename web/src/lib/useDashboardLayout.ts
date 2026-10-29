'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { DASHBOARD_WIDGETS, defaultLayout, normalizeLayout, sizeOf, type DashboardLayout, type DashboardSize, type DashboardZone } from '@telehealth/shared-types';
import { MY_DASHBOARD_LAYOUT, RESET_MY_DASHBOARD_LAYOUT, SAVE_MY_DASHBOARD_LAYOUT } from '@/graphql/dashboardLayout';

const widgetOf = (id: string) => DASHBOARD_WIDGETS.find((w) => w.id === id);

// The API sends sizes as a list of { id, size }; the layout keeps them as { id: size }.
const fromApi = (l: { sizes?: Array<{ id: string; size: string }> } & Record<string, unknown>) => normalizeLayout({ ...l, sizes: Object.fromEntries((l.sizes ?? []).map((x) => [x.id, x.size])) });
const toApi = (l: DashboardLayout) => ({ top: l.top, main: l.main, side: l.side, hidden: l.hidden, sizes: Object.entries(l.sizes).map(([id, size]) => ({ id, size })) });

/**
 * How the patient has arranged the cards on their home screen, with the ways to change it. Each change shows at once and is
 * saved in the background; if saving fails the screen keeps the change and says so, so nothing is lost in front of them.
 */
export function useDashboardLayout() {
  const { data, loading } = useQuery(MY_DASHBOARD_LAYOUT, { fetchPolicy: 'cache-and-network' });
  const [layout, setLayout] = useState<DashboardLayout>(defaultLayout);
  const [error, setError] = useState<unknown>(null);
  // Cards support is hiding for a while: shown to the patient as a note, never saved as their own choice.
  const [staffHidden, setStaffHidden] = useState<Array<{ id: string; until: string }>>([]);
  const loaded = useRef(false);
  // Saves go one after the other, in the order they were made: two quick changes must not arrive swapped and leave the older one saved.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [save] = useMutation(SAVE_MY_DASHBOARD_LAYOUT);
  const [reset] = useMutation(RESET_MY_DASHBOARD_LAYOUT);

  // What was saved is taken once, when it arrives: later changes are the patient's own.
  useEffect(() => {
    if (data?.myDashboardLayout && !loaded.current) {
      loaded.current = true;
      setLayout(fromApi(data.myDashboardLayout));
      setStaffHidden(data.myDashboardLayout.staffHidden ?? []);
    }
  }, [data]);

  const commit = (next: DashboardLayout) => {
    setLayout(next);
    setError(null);
    queue.current = queue.current.then(() => save({ variables: { input: toApi(next) } })).catch(setError);
  };

  /** The place a card is in right now. */
  const placeOf = (id: string): DashboardZone | undefined => (['top', 'main', 'side'] as DashboardZone[]).find((z) => layout[z].includes(id));

  /** One step earlier or later in its own place (the arrows: dragging is not possible on a phone). */
  const move = (id: string, delta: -1 | 1) => {
    const zone = placeOf(id);
    if (!zone) return;
    const list = [...layout[zone]];
    const from = list.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
    commit({ ...layout, [zone]: list });
  };

  /** Puts a card in a place, before another card there, or at the end. Where the card can't go, nothing happens. */
  const moveTo = (id: string, zone: DashboardZone, beforeId?: string) => {
    const widget = widgetOf(id);
    if (!widget || !widget.zones.includes(zone) || id === beforeId) return;
    const next: DashboardLayout = { ...layout, top: layout.top.filter((x) => x !== id), main: layout.main.filter((x) => x !== id), side: layout.side.filter((x) => x !== id) };
    const list = [...next[zone]];
    const at = beforeId ? list.indexOf(beforeId) : -1;
    if (at >= 0) list.splice(at, 0, id);
    else list.push(id);
    commit({ ...next, [zone]: list });
  };

  const hide = (id: string) => {
    const zone = placeOf(id);
    if (!zone || widgetOf(id)?.required) return;
    commit({ ...layout, [zone]: layout[zone].filter((x) => x !== id), hidden: [...layout.hidden, id] });
  };

  const show = (id: string) => {
    const widget = widgetOf(id);
    if (!widget) return;
    commit({ ...layout, [widget.zone]: [...layout[widget.zone], id], hidden: layout.hidden.filter((x) => x !== id) });
  };

  /** A card's size, for the cards that can be resized, to one of the sizes it offers. */
  const setSize = (id: string, size: DashboardSize) => {
    const widget = widgetOf(id);
    if (!widget?.sizes?.includes(size) || sizeOf(layout, id) === size) return;
    commit({ ...layout, sizes: { ...layout.sizes, [id]: size } });
  };

  const restoreDefaults = () => {
    setLayout(defaultLayout());
    setError(null);
    queue.current = queue.current.then(() => reset()).catch(setError);
  };

  // Data from the cache is there on the first render, but is applied a moment later (in the effect above): until then
  // this still counts as loading, so the standard arrangement never flashes before the saved one.
  const applying = Boolean(data?.myDashboardLayout) && !loaded.current;
  return { layout, staffHidden, loading: (loading && !data) || applying, error, move, moveTo, setSize, hide, show, restoreDefaults };
}
