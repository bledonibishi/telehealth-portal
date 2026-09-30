-- CreateEnum
CREATE TYPE "CheckInFeeling" AS ENUM ('GREAT', 'GOOD', 'OKAY', 'DIFFICULTIES', 'NOT_WELL');

-- AlterTable
ALTER TABLE "check_ins" ADD COLUMN     "feeling" "CheckInFeeling",
ADD COLUMN     "weight_kg" DECIMAL(4,1);

-- CreateTable
CREATE TABLE "weight_goals" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "starting_weight_kg" DECIMAL(4,1) NOT NULL,
    "target_weight_kg" DECIMAL(4,1) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weight_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weight_goals_patient_id_key" ON "weight_goals"("patient_id");

-- AddForeignKey
ALTER TABLE "weight_goals" ADD CONSTRAINT "weight_goals_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: completed check-ins already recorded the weight inside `answers`.
UPDATE "check_ins" c
SET "weight_kg" = round((e.elem ->> 'value')::numeric, 1)
FROM (
  SELECT ci."id", a.elem
  FROM "check_ins" ci,
       jsonb_array_elements(CASE WHEN jsonb_typeof(ci."answers") = 'array' THEN ci."answers" ELSE '[]'::jsonb END) AS a(elem)
) e
WHERE c."id" = e."id"
  AND e.elem ->> 'questionId' = 'weight_kg'
  AND e.elem ->> 'value' ~ '^[0-9]{1,3}(\.[0-9]+)?$'
  AND c."status" = 'COMPLETED';
