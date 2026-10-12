-- An account created any other way (a seed, a script) with a password counts as having one set; only an invitation says
-- null, on purpose, until the person chooses theirs.
ALTER TABLE "clinicians" ALTER COLUMN "password_set_at" SET DEFAULT now();
