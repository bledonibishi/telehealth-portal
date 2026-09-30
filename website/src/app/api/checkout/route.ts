import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2023-10-16',
});

// This app now owns the domain — success/cancel URLs point to our own pages.
// CORS headers are kept for backward-compat if the Webflow site still calls this endpoint.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3001';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': SITE_URL,
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
    success_url: `${SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/checkout/cancel`,
    metadata: { planName },
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url }, { headers: corsHeaders() });
}
