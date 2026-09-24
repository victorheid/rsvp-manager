/*
  Warnings:

  - You are about to drop the column `cardBrand` on the `WaitlistEntry` table. All the data in the column will be lost.
  - You are about to drop the column `cardLast4` on the `WaitlistEntry` table. All the data in the column will be lost.
  - You are about to drop the column `paymentMethod` on the `WaitlistEntry` table. All the data in the column will be lost.
  - You are about to drop the column `promotionMode` on the `WaitlistEntry` table. All the data in the column will be lost.
  - You are about to drop the column `stripePaymentMethodId` on the `WaitlistEntry` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "WaitlistMode" AS ENUM ('IN_ORDER', 'FIRST_TO_CLAIM');

-- CreateEnum
CREATE TYPE "WaitlistEntryStatus" AS ENUM ('WAITING', 'DROPPED_OUT');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "waitlistHoldMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "waitlistMode" "WaitlistMode" NOT NULL DEFAULT 'IN_ORDER';

-- AlterTable
ALTER TABLE "WaitlistEntry" DROP COLUMN "cardBrand",
DROP COLUMN "cardLast4",
DROP COLUMN "paymentMethod",
DROP COLUMN "promotionMode",
DROP COLUMN "stripePaymentMethodId",
ADD COLUMN     "droppedAt" TIMESTAMP(3),
ADD COLUMN     "heldUntil" TIMESTAMP(3),
ADD COLUMN     "missedHoldAt" TIMESTAMP(3),
ADD COLUMN     "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "status" "WaitlistEntryStatus" NOT NULL DEFAULT 'WAITING';

-- DropEnum
DROP TYPE "WaitlistPromotionMode";

-- Existing entries keep their place in line: first come, first served by when they joined.
UPDATE "WaitlistEntry" SET "queuedAt" = "createdAt";
