-- CreateTable
CREATE TABLE "FeeSchedule" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "gameCardFeeTiers" JSONB NOT NULL,
    "topUpFeeTiers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeeSchedule_version_key" ON "FeeSchedule"("version");

-- Version 1 (spec §5): €0.50 flat per card payment for a game; top-ups €1 up to
-- €20, €1.50 up to €50, €2.50 up to €100. Keep in sync with DEFAULT_FEE_SCHEDULE
-- in src/server/domains/fees/rules.ts (tests re-seed from that constant).
INSERT INTO "FeeSchedule" ("id", "version", "effectiveFrom", "gameCardFeeTiers", "topUpFeeTiers")
VALUES (
    'fee_schedule_v1',
    1,
    '2026-01-01 00:00:00',
    '[{"upToCents":null,"feeCents":50}]',
    '[{"upToCents":2000,"feeCents":100},{"upToCents":5000,"feeCents":150},{"upToCents":10000,"feeCents":250}]'
);

-- Existing events were created under version 1.
ALTER TABLE "Event" ADD COLUMN "feeScheduleId" TEXT;
UPDATE "Event" SET "feeScheduleId" = 'fee_schedule_v1';
ALTER TABLE "Event" ALTER COLUMN "feeScheduleId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_feeScheduleId_fkey" FOREIGN KEY ("feeScheduleId") REFERENCES "FeeSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
