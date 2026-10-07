-- CreateTable
CREATE TABLE "side_effect_logs" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nausea" INTEGER NOT NULL,
    "vomiting" INTEGER NOT NULL,
    "abdominal_pain" INTEGER NOT NULL,
    "diarrhoea" INTEGER NOT NULL,
    "constipation" INTEGER NOT NULL,
    "fatigue" INTEGER NOT NULL,
    "note" TEXT,
    "client_request_id" TEXT,

    CONSTRAINT "side_effect_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "side_effect_logs_patient_id_recorded_at_idx" ON "side_effect_logs"("patient_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "side_effect_logs_patient_id_client_request_id_key" ON "side_effect_logs"("patient_id", "client_request_id");

-- AddForeignKey
ALTER TABLE "side_effect_logs" ADD CONSTRAINT "side_effect_logs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every score is on the 1–10 scale.
ALTER TABLE "side_effect_logs" ADD CONSTRAINT "side_effect_logs_scores_range" CHECK (
  "nausea" BETWEEN 1 AND 10 AND "vomiting" BETWEEN 1 AND 10 AND "abdominal_pain" BETWEEN 1 AND 10
  AND "diarrhoea" BETWEEN 1 AND 10 AND "constipation" BETWEEN 1 AND 10 AND "fatigue" BETWEEN 1 AND 10
);
