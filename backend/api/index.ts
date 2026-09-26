import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../src/create-app';

// Vercel runs each request as its own invocation, but a "warm" container
// reuses this module — caching the bootstrapped app across calls avoids
// paying Nest's full startup cost on every request.
let appPromise: Promise<import('@nestjs/common').INestApplication> | null = null;

function getApp() {
  if (!appPromise) {
    appPromise = createApp().then(async (app) => {
      await app.init();
      return app;
    });
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  const expressInstance = app.getHttpAdapter().getInstance();
  expressInstance(req, res);
}

// Nest/Express need the raw request body themselves (Stripe webhook signature
// verification depends on it) — disable Vercel's own body parsing so it
// doesn't consume the stream first.
export const config = {
  api: {
    bodyParser: false,
  },
};
