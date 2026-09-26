-- CreateEnum
CREATE TYPE "CheckInStatus" AS ENUM ('SCHEDULED', 'SENT', 'COMPLETED');

-- CreateTable
CREATE TABLE "check_ins" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "status" "CheckInStatus" NOT NULL DEFAULT 'SCHEDULED',
    "token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "answers" JSONB,
    "wants_to_reorder" BOOLEAN,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "check_ins_token_key" ON "check_ins"("token");

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
