-- AlterTable
ALTER TABLE "onboarding_submissions" DROP COLUMN "rejected_steps";
ALTER TABLE "onboarding_submissions" DROP COLUMN "rejection_reason";
ALTER TABLE "onboarding_submissions" ADD COLUMN     "step_feedback" JSONB NOT NULL DEFAULT '[]';
