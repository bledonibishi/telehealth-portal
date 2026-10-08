-- An application whose consultation was declined is closed, not "pending review". (Used in the next migration:
-- a new enum value can't be used in the transaction that adds it.)
ALTER TYPE "OnboardingStatus" ADD VALUE 'DECLINED';
