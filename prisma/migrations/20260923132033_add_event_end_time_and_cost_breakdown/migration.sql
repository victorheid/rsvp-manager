/*
  Warnings:

  - Added the required column `endsAt` to the `Event` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "costBreakdown" JSONB,
ADD COLUMN     "endsAt" TIMESTAMP(3) NOT NULL;
