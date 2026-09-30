# Project rules for Claude

## Environment files

- **Never edit, overwrite, create or delete any `.env` file** (`backend/.env`, `web/.env*`, `clinician/.env*`, etc.). They hold the developer's real local settings and secrets.
- If a change needs a new or different environment variable, do not touch the `.env`. Tell the user which variable to set and its value, and let them add it.
- Updating `.env.example` files is fine, because they document the variables and hold no secrets.
- When running the backend or tests, do not rely on the developer's real `.env` values (for example the PostHog key, Stripe, Resend). Override them on the command line or in a separate scratch env file so nothing is sent to real external services.
