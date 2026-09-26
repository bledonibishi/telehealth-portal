import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2023-10-16',
});

// The Webflow site now owns the domain — this app only serves this API from a subdomain,
// so requests come in cross-origin and need explicit CORS handling.
const ALLOWED_ORIGIN = process.env.WEBFLOW_SITE_URL ?? 'http://localhost:3000';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 500, headers: corsHeaders() });
  }

  const { priceId, planName } = (await req.json()) as { priceId: string; planName: string };

  if (!priceId) {
    return NextResponse.json({ error: 'Missing priceId.' }, { status: 400, headers: corsHeaders() });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${ALLOWED_ORIGIN}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${ALLOWED_ORIGIN}/checkout/cancel`,
    metadata: { planName },
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url }, { headers: corsHeaders() });
}
