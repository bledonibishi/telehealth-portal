// Loaded first, before any other /scripts/*.js — edit these when endpoints change.
// All values here are public by design (client-side URLs / publishable keys), never secrets.
window.TELEHEALTH_CONFIG = {
  // This Next.js app's own deployment (Vercel) — hosts /api/checkout. Verified live.
  apiBase: 'https://telehealth-portal-website.vercel.app',

  // Backend GraphQL endpoint (createLead / requestManualInvoice mutations).
  // Not deployed yet — see website/README.md.
  graphqlUrl: 'https://your-backend-domain.example.com/graphql',

  // Stripe publishable key (Dashboard → Developers → API keys). Safe to expose
  // client-side — it's not the secret key.
  stripePublishableKey: 'pk_test_your_publishable_key',

  // PostHog project key + host, same project the backend already reports to.
  // The project API key is safe to expose client-side (it is not a secret).
  posthog: {
    key: 'phc_your_project_key',
    host: 'https://us.i.posthog.com',
  },
};
