# @telehealth/guide

The app guide: a step-by-step tour that dims the screen, lights up one thing at a time and says what it is for. It is
for anyone new to an app — a patient, a new doctor or CX colleague, or someone being shown the product. Each person
switches it on for themselves; nothing about it is stored on the server.

| App | Switch | Tours |
| --- | --- | --- |
| Patient portal (web) | Settings → App guide | `web/src/lib/guide-tours.ts` |
| Clinician portal (every role) | the **Guide** button in the header | `clinician/src/lib/guide/tours.ts` (texts translated in the dictionaries) |
| Mobile app | More → Show me around | `mobile/src/lib/guideTours.ts` |

## How it behaves

- Switching it on starts the **tour of the app**: every menu item and what it is for.
- While it is on, each page (screen) with a tour **explains itself the first time it is opened**.
- A floating **Guide** button replays the page's tour or the tour of the app, or switches the guide off.
- A tour that is finished or skipped is remembered on that device (browser `localStorage` / phone secure store, key
  `omo.guide`) and doesn't start again by itself.
- A step whose target isn't on screen is **skipped**. That is how one tour fits every role (a menu item the role doesn't
  have isn't there), the computer and the phone layout, and every programme.

## Adding a step

1. Mark what the step points at:
   - web: `data-guide="orders:search"` on the element (`Card` and `PageHeader` in the patient portal take it already);
   - mobile: wrap it in `<GuideTarget id="orders:search">`. Tabs are `tab:<route name>`, a `Screen`'s title is `screen-header`.
2. Add `{ target, title, body }` to the page's tour. Leave `target` out for a step that only explains.
3. Clinician portal: add the title and body to `sq.ts`, `de.ts` and `es.ts`.
4. Rewrote a tour? Bump its id (`.v1` → `.v2`) so people who saw the old one get the new one.

Write steps for the person using the page: what it is and what they can do with it, in a sentence or two. Only describe
what the page really does.

## Pieces

- `src/index.ts` — the tour types and the rules every app follows (which step comes next, the saved state). No React.
- `src/web.tsx` — `GuideProvider`, `useGuide` and the overlay for the browser.
- The mobile overlay is in `mobile/src/components/guide` (built from the app's component library; story under
  Components/GuideOverlay).
