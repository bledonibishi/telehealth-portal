-- Tighten the weight_entries append-only guard.
--
-- Before: any update that touched only the void_* columns was allowed on an *active* row, so
-- void attribution (voided_by_id / void_reason) could be written without the entry actually
-- being voided. Now the only update that passes is the one that voids an active row:
-- voided_at and voided_by_id must both be set (a reason stays optional — a patient removing
-- their own mistaken entry may give none). Everything else, including changing an already
-- voided row, is rejected, exactly as before.
CREATE OR REPLACE FUNCTION weight_entries_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'weight_entries is append-only: rows cannot be deleted';
  END IF;
  IF OLD."voided_at" IS NOT NULL THEN
    RAISE EXCEPTION 'weight_entries is append-only: a voided entry cannot be changed';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."patient_id" IS DISTINCT FROM OLD."patient_id"
     OR NEW."weight_kg" IS DISTINCT FROM OLD."weight_kg"
     OR NEW."measured_at" IS DISTINCT FROM OLD."measured_at"
     OR NEW."recorded_at" IS DISTINCT FROM OLD."recorded_at"
     OR NEW."source" IS DISTINCT FROM OLD."source"
     OR NEW."note" IS DISTINCT FROM OLD."note"
     OR NEW."client_request_id" IS DISTINCT FROM OLD."client_request_id"
     OR NEW."corrects_id" IS DISTINCT FROM OLD."corrects_id" THEN
    RAISE EXCEPTION 'weight_entries is append-only: only voiding is allowed';
  END IF;
  -- The remaining change must be a complete void of this active row.
  IF NEW."voided_at" IS NULL OR NEW."voided_by_id" IS NULL THEN
    RAISE EXCEPTION 'weight_entries is append-only: an update must void the entry (voided_at and voided_by_id are required)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
