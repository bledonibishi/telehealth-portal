-- AlterTable
ALTER TABLE "onboarding_submissions" ADD COLUMN     "rejected_steps" TEXT[] DEFAULT ARRAY[]::TEXT[];
