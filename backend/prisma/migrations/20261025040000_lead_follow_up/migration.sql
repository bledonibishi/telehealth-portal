-- CX follow-up on leads that have not paid: who last contacted them and when, and a permanent "do not contact".
ALTER TABLE "leads" ADD COLUMN "last_contacted_at" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN "last_contacted_by_id" TEXT;
ALTER TABLE "leads" ADD COLUMN "do_not_contact_at" TIMESTAMP(3);
