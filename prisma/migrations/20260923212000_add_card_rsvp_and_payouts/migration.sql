-- AlterTable
ALTER TABLE "Rsvp" ADD COLUMN     "cardBrand" TEXT,
ADD COLUMN     "cardLast4" TEXT,
ADD COLUMN     "payToken" TEXT,
ADD COLUMN     "stripePaymentMethodId" TEXT;

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "providerTransferId" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payout_eventId_key" ON "Payout"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Rsvp_payToken_key" ON "Rsvp"("payToken");

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
