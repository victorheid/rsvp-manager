-- AlterTable
ALTER TABLE "WaitlistEntry" ALTER COLUMN "paymentMethod" DROP NOT NULL,
ALTER COLUMN "promotionMode" SET DEFAULT 'MANUAL';
