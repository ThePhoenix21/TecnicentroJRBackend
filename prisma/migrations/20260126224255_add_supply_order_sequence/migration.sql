/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,providerId,sequence]` on the table `SupplyOrder` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."SupplyOrder" ADD COLUMN     "sequence" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "SupplyOrder_tenantId_providerId_sequence_key" ON "public"."SupplyOrder"("tenantId", "providerId", "sequence");
