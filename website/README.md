# website

The marketing site itself is built and hosted in **Webflow**. This folder no longer contains any
pages — it exists to host:

1. `/api/checkout` — a server-side endpoint (needs the Stripe secret key, so it can't live in Webflow).
2. `public/scripts/*.js` — the vanilla JS widgets and feature-flag logic Webflow loads via custom code.

Deployed on Vercel (currently `https://telehealth-portal-website.vercel.app`), while the Webflow
site owns the actual domain.

## Wiring it into Webflow

`quiz.js` and `checkout.js` target markup that's already built in the Webflow Designer (the
`data-th-*` attributes below) — there's no generic mount div to add. If you're building a new
product/plan page from scratch, copy the attribute structure from an existing page rather than
inventing new class/attribute names, since the scripts and the Designer's own CSS both key off them.

In Webflow: **Site Settings → Custom Code → Footer Code** (runs before `</body>` on every page),
add these script tags in this order:

```html
<script src="https://telehealth-portal-website.vercel.app/scripts/config.js"></script>
<script src="https://telehealth-portal-website.vercel.app/scripts/feature-flags.js"></script>
<script src="https://telehealth-portal-website.vercel.app/scripts/quiz.js"></script>
<script src="https://telehealth-portal-website.vercel.app/scripts/checkout.js"></script>
```

Don't load `styles.js` on these pages — the Designer already has real, polished CSS for every
`th-*` class quiz.js/checkout.js render into (`th-quiz-option`, `th-plan-card`, etc.), matching the
site's existing `th-card`/`th-btn-*` design system. `styles.js` predates that design system and
would fight it (same class names, different rules); it's only useful if you're building a page from
scratch that has no `th-*` styles of its own yet.

Both scripts no-op on any page that doesn't have their mount markup, so it's safe to load them
site-wide rather than per-page.

First, edit [public/scripts/config.js](public/scripts/config.js) with your real API base URL,
backend GraphQL URL, Stripe publishable key, and PostHog project key/host.

### Quiz pages (`/hrt-eligibility`, `/glp1-eligibility`)

Each page has a `[data-th-quiz="HRT"]` or `[data-th-quiz="GLP1"]` mount div, and three sibling
`[data-th-screen]` blocks the script shows/hides: `"quiz"`, `"ineligible"`, `"plans"`. quiz.js
renders the question flow and the lead-capture form (first name / last name / email) inside the
mount div, calls `createLead`, then reveals the `"plans"` screen — whose plan cards are real
Designer content, not JS-rendered. Clicking a `[data-th-plan="HRT_STARTER"]` link stores the
selection in `sessionStorage` and navigates to `/checkout`.

The ineligible screen's reason text (`[data-th-reason]`) and its "review my answers" link
(`[data-th-restart]`) are filled in / wired up by the script; everything else on that screen is
static Designer content.

### Checkout page (`/checkout`)

Has two `[data-th-screen]` states: `"nosession"` (shown if someone lands here without having
picked a plan — e.g. a bookmark or back button) and `"checkout"` (the real flow). checkout.js reads
the plan chosen on the quiz page from `sessionStorage`, fills in the order summary
(`[data-th-sum="name"|"desc"|"price"]`), and handles the two payment methods
(`[data-th-method="stripe"|"paysera"]` cards, `[data-th-panel]` for each one's detail view):

- **Stripe** — mounts Stripe's [Embedded Checkout](https://docs.stripe.com/checkout/embedded/quickstart)
  into `[data-th-stripe-mount]`. This calls `/api/checkout`, which creates a Checkout Session in
  `ui_mode: 'embedded'` mode and returns a `clientSecret`; the card form renders inside the page
  instead of redirecting away. It's still a Checkout Session under the hood, so the existing
  `checkout.session.completed` webhook (`backend/src/stripe/stripe-webhook.service.ts`) handles
  patient activation exactly as before — nothing there needed to change.
  **Edit the Stripe Price IDs directly in [public/scripts/checkout.js](public/scripts/checkout.js)**
  (the `PLANS` object) — this is a static file, it can't read environment variables at runtime.
- **Paysera** — there's no Paysera merchant account / API integration yet. Picking it and clicking
  `[data-th-pay]` calls the backend's `requestManualInvoice` mutation, which emails ops
  (`OPS_NOTIFICATION_EMAIL`) to follow up with a real payment link by hand, and emails the customer
  a "we'll be in touch" confirmation. Revisit this once there's a Paysera account — see
  `backend/src/leads/leads.service.ts`.

### Success / cancel pages

`/checkout-success` and `/checkout-cancel` live in Webflow. Stripe's embedded flow redirects to
`/checkout-success` on completion (see `return_url` in `src/app/api/checkout/route.ts`); the manual
Paysera request redirects there too, since "check your email" is accurate either way. The redirect
domain is controlled by the `WEBFLOW_SITE_URL` env var on this app (see `.env.local.example`).
`/checkout-cancel` isn't used by the embedded flow (the customer never leaves the page), but keep
it around for a "back" link or a future hosted-redirect fallback.

## Feature flags & experiments

`feature-flags.js` boots PostHog and exposes `window.featureFlags`. To gate a Webflow element on
a flag, add a custom attribute directly in the Designer — no code needed:

```html
<div data-th-flag="new-quiz-copy">...</div>                         <!-- shown if flag is truthy -->
<div data-th-flag="quiz-experiment" data-th-flag-value="variant-b">...</div>  <!-- shown only for that variant -->
```

Elements are hidden by default until flags resolve (avoids a flash of the wrong variant), then
shown/hidden based on the match. Multivariate flags with variants are how PostHog experiments
work, so the same mechanism covers both feature flags and A/B tests.

## Local development

```
pnpm --filter @telehealth/website dev
```

Only `/api/checkout` is servable locally — there's no page to visit at `/`. Point Webflow's
custom code at `http://localhost:3001` temporarily to test script changes against a local API,
or just edit and reload the static files directly (no build step for `public/scripts/*.js`).
