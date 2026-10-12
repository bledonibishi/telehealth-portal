-- The account's session version when the link was asked for. A link is refused once that version has moved on
-- (a password change, a reset, signing out everywhere). Null for links issued before this column existed.
ALTER TABLE "password_resets" ADD COLUMN "token_version" INTEGER;
