-- AlterTable
ALTER TABLE "products" ADD COLUMN     "doses_per_week" INTEGER;

-- Twice-weekly estradiol patches, so existing catalogues get a patch dose
-- calendar without re-running the catalog seed (matches prisma/catalog.ts).
UPDATE "products" SET "doses_per_week" = 2 WHERE "slug" = 'estradiol-patch-evorel' AND "dose_interval_days" IS NULL;
