-- CreateEnum
CREATE TYPE "InjectionSite" AS ENUM ('ABDOMEN_LEFT', 'ABDOMEN_RIGHT', 'THIGH_LEFT', 'THIGH_RIGHT', 'ARM_LEFT', 'ARM_RIGHT');

-- AlterTable
ALTER TABLE "dose_events"
  ADD COLUMN "injection_site" "InjectionSite",
  ADD COLUMN "feeling_after" "CheckInFeeling",
  ADD COLUMN "feeling_after_at" TIMESTAMP(3);
