-- The Stripe customer made for a buyer at checkout, kept so it is reused rather than looked up by email.
ALTER TABLE "leads" ADD COLUMN "stripe_customer_id" TEXT;
