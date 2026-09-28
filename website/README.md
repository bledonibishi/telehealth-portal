# website

The marketing site itself is built and hosted in **Webflow**. This folder no longer contains any
pages — it exists to host:

1. `/api/checkout` — a server-side endpoint (needs the Stripe secret key, so it can't live in Webflow).
2. `public/scripts/*.js` — the vanilla JS widgets and feature-flag logic Webflow loads via custom code.

Deployed on Vercel at `website.webmaverics.com`, while the apex domain (`webmaverics.com`) points
at Webflow, and the backend (GraphQL API, on EC2) is at `api.webmaverics.com`.

## Wiring it into Webflow

In Webflow: **Site Settings → Custom Code → Footer Code** (runs before `</body>` on every page),
add these script tags in this order:

```html
<script src="https://website.webmaverics.com/scripts/config.js"></script>
<script src="https://website.webmaverics.com/scripts/styles.js"></script>
<script src="https://website.webmaverics.com/scripts/feature-flags.js"></script>
<script src="https://website.webmaverics.com/scripts/quiz.js"></script>
<script src="https://website.webmaverics.com/scripts/checkout.js"></script>
```

`quiz.js` and `checkout.js` no-op on any page that doesn't have their mount element, so it's safe
to load all of them site-wide rather than per-page.

First, edit [public/scripts/config.js](public/scripts/config.js) with your real API base URL,
backend GraphQL URL, and PostHog project key/host.

### Quiz page

Add a single empty div anywhere on the page, with a custom attribute set in the Webflow Designer
(Settings panel → **Custom Attributes**):

```html
<div id="th-quiz-app" data-product="hrt"></div>
```

Use `data-product="glp1"` on the GLP-1 quiz page. The widget renders the entire question flow,
eligibility check, and the lead-capture form (first name / last name / email) inside that div,
calling the backend's `createLead` mutation before redirecting to your plans page.

Optional attributes on the same div (defaults shown):
- `data-plans-url="/plans"` — where "Continue to plans" redirects to
- `data-quiz-url-hrt="/quiz?product=hrt"` / `data-quiz-url-glp1="/quiz?product=glp1"` — used on the
  ineligible screen's "try the other quiz" link
- `data-home-url="/"`

### Plans page

```html
<div id="th-plans-app" data-product="hrt"></div>
```

Renders the plan cards and handles the "Select plan" → `/api/checkout` → Stripe redirect flow.
**Edit the Stripe Price IDs directly in [public/scripts/checkout.js](public/scripts/checkout.js)**
(the `PLANS` object) — this is a static file, it can't read environment variables at runtime.

### Success / cancel pages

These now live in Webflow (`/checkout/success`, `/checkout/cancel`) — Stripe redirects there
directly. Nothing to wire up on your end; just build those two pages in Webflow. The redirect
target is controlled by the `WEBFLOW_SITE_URL` env var on this app (see `.env.local.example`).

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
