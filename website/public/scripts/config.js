// Loaded first, before any other /scripts/*.js — edit these when endpoints change.
// All values here are public by design (client-side URLs / a PostHog project key), never secrets.
window.TELEHEALTH_CONFIG = {
  // This Next.js app's own deployment (Vercel) — hosts /api/checkout.
  apiBase: 'https://your-vercel-subdomain.vercel.app',

  // Backend GraphQL endpoint (createLead mutation).
  graphqlUrl: 'https://your-backend-domain.example.com/graphql',

  // PostHog project key + host, same project the backend already reports to.
  // The project API key is safe to expose client-side (it is not a secret).
  posthog: {
    key: 'phc_your_project_key',
    host: 'https://us.i.posthog.com',
  },
};
