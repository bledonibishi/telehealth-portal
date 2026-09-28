-- CreateTable
CREATE TABLE "throttle_counters" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "throttle_counters_pkey" PRIMARY KEY ("key")
);
