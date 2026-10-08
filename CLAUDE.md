# Project rules for Claude

## Environment files

- **Never edit, overwrite, create or delete any `.env` file** (`backend/.env`, `web/.env*`, `clinician/.env*`, etc.). They hold the developer's real local settings and secrets.
- If a change needs a new or different environment variable, do not touch the `.env`. Tell the user which variable to set and its value, and let them add it.
- Updating `.env.example` files is fine, because they document the variables and hold no secrets.
- When running the backend or tests, do not rely on the developer's real `.env` values (for example the PostHog key, Stripe, Resend). Override them on the command line or in a separate scratch env file so nothing is sent to real external services.

## Working with the owner: say so when there is a better way

- On **every topic and every feature**, if the owner proposes something that looks like a bad idea, carries a risk (legal,
  clinical, financial, security, privacy, UX) or has a better alternative, **say so plainly**, with the reason and a
  recommendation. Do this even when it was not asked for and even when it means disagreeing.
- Say it **before or while doing the work**, not after, and keep it short: what the concern is, what you would do instead,
  and what it costs. Don't bury it.
- The owner decides. Once they have heard the concern and chosen, do it their way without re-arguing; if something new
  makes the risk worse, mention it once.
- Prefer a recommendation over a list of options. If you are unsure whether something is true or lawful (this is a
  prescription-medicine business in Kosovo, with plans for Europe), say what you checked, what you could not verify, and
  who should confirm it.
