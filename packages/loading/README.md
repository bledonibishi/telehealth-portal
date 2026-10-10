# @telehealth/loading

Loading for every app (patient portal and clinician portal). One package, so a wait looks and behaves the same everywhere
and changing it is a change in one place.

## What is here

| Piece | Use it for |
| --- | --- |
| `GlobalProgress` | The thin bar across the top. Mounted once per app in `Providers`. Shows on page changes and on slow requests. |
| `createLoadingLink()` | Put first in the Apollo link chain (`lib/apollo.ts`): every GraphQL call is counted for the bar. |
| `LoadingState` | A section or page waiting for data: spinner and label. `variant`: `inline`, `block` (default), `page`. |
| `Skeleton*` | Grey placeholder shapes shaped like the content that is coming: `SkeletonText`, `SkeletonList` (avatar rows), `SkeletonTable` and `SkeletonTableRows` (rows inside a real `<tbody>`, so the header stays), `SkeletonCard`, `SkeletonStat` (a dashboard metric), `SkeletonTile`, `SkeletonMessages` (a chat), `SkeletonAvatar`, and `Skeleton` itself as the building block. |
| `BusyLabel` | The inside of a button that is working: a spinner and busy wording. |
| `Spinner` | The ring, on its own, when none of the above fits. |
| `trackProgress(promise)` | Counts work that does not go through Apollo (a `fetch`, an upload) for the top bar. |
| `configureLoading({...})` | Re-theme everything (see below). |

## Using it

```tsx
import { LoadingState, SkeletonList, BusyLabel } from '@telehealth/loading';

if (loading) return <LoadingState label={t('Loading queue…')} />;           // pass the label already translated
if (loading) return <SkeletonList rows={6} label={t('Loading queue…')} />;  // prefer a skeleton for lists and tables
<button disabled={saving}><BusyLabel busy={saving} busyText={t('Saving…')}>{t('Save')}</BusyLabel></button>
```

Which one: a **skeleton** when you know the shape of what is coming (a list, a table, a card), a **LoadingState** when you
do not or the area is small, **BusyLabel** for a button the reader just pressed.

Pages: `app/(portal)/loading.tsx` in each app shows `LoadingState variant="page"` while a route loads.

### The top bar

- It shows for a page change after 100 ms and for a request after 500 ms (`requestDelayMs`, `routeDelayMs`), so quick
  requests and the many background polls never flash it.
- To keep one call off the bar: `useQuery(Q, { pollInterval: 60_000, context: { silentLoading: true } })`.
- Page changes are detected from clicks on internal links. A navigation made only in code (`router.push`) is still
  covered by the requests the new page makes.

## Changing the look

All class strings live in `src/config.ts`. They default to the app's own `brand` colour and to the surrounding text colour,
so they follow light and dark mode without any per-theme code.

```ts
// once, e.g. in an app's Providers
configureLoading({ spinner: 'text-teal-600', bar: 'bg-teal-600', requestDelayMs: 300 });
```

For a single place, pass `className` (it is added last): `<LoadingState className="py-6" />`, `<Skeleton className="h-4 w-32" />`.

Tailwind has to see the classes: each app lists `../packages/loading/src/**/*.{ts,tsx}` in `tailwind.config.ts` `content`.
If you change a class here and it does not appear, check that line first.

## Extending it

- **A new placeholder shape**: compose `Skeleton`s in a new function in `src/Skeleton.tsx` (copy `SkeletonCard`), export it
  from `src/index.ts`. Use `Region` so the wait is announced once.
- **A new variant of `LoadingState`**: add an entry to `VARIANTS` in `src/LoadingState.tsx`; the type follows.
- **Another source for the top bar** (a websocket reconnect, a long upload): call `progress.beginRequest()` and
  `progress.endRequest()` around it, or wrap the promise in `trackProgress`.
- **A new web app**: add the package to its `package.json`,
  `transpilePackages`, `tsconfig` paths and Tailwind `content`, mount `GlobalProgress`, and add `createLoadingLink()` to its client.

## Rules the components keep

- A wait is announced once, to screen readers, by the region (`role="status"`), never by every shape inside it.
- Reduced motion: skeletons stop pulsing, the spinner turns slowly, the top bar becomes a still line.
- `progress.ts` and `apollo.ts` are `'use client'` modules, so server components (like a route's `loading.tsx`) can still import
  from the package.

## Mobile

The mobile app has its own native version in `mobile/src/components/Skeleton.tsx` (with a Storybook story), because this package is
web-only. It has the same names and idea: `Skeleton`, `SkeletonText`, `SkeletonCard`, `SkeletonRows`, `LoadingState`. Keep the two in step when you add one.
