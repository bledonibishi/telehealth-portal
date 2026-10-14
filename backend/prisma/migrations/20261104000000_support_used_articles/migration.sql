-- AlterTable
ALTER TABLE "support_threads" ADD COLUMN "used_articles" TEXT[] DEFAULT ARRAY[]::TEXT[];
