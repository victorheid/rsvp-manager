-- AlterTable
ALTER TABLE "WaitlistEntry" ADD COLUMN     "cardBrand" TEXT,
ADD COLUMN     "cardLast4" TEXT,
ADD COLUMN     "stripePaymentMethodId" TEXT;
