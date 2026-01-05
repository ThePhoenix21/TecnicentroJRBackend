/*
  Warnings:

  - The values [CLOSED] on the enum `SupportStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `endedAt` on the `Employed` table. All the data in the column will be lost.
  - You are about to drop the column `hiredAt` on the `Employed` table. All the data in the column will be lost.
  - You are about to drop the `StoreSupplyOrder` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WarehouseSupplyOrder` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."SupportStatus_new" AS ENUM ('OPEN', 'IN_PROGRESS', 'CANCELLED', 'REFUSED', 'COMPLETED');
ALTER TABLE "public"."SupportTicket" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."SupportTicket" ALTER COLUMN "status" TYPE "public"."SupportStatus_new" USING ("status"::text::"public"."SupportStatus_new");
ALTER TYPE "public"."SupportStatus" RENAME TO "SupportStatus_old";
ALTER TYPE "public"."SupportStatus_new" RENAME TO "SupportStatus";
DROP TYPE "public"."SupportStatus_old";
ALTER TABLE "public"."SupportTicket" ALTER COLUMN "status" SET DEFAULT 'OPEN';
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."StoreSupplyOrder" DROP CONSTRAINT "StoreSupplyOrder_storeId_fkey";

-- DropForeignKey
ALTER TABLE "public"."StoreSupplyOrder" DROP CONSTRAINT "StoreSupplyOrder_supplyOrderId_fkey";

-- DropForeignKey
ALTER TABLE "public"."WarehouseSupplyOrder" DROP CONSTRAINT "WarehouseSupplyOrder_supplyOrderId_fkey";

-- DropForeignKey
ALTER TABLE "public"."WarehouseSupplyOrder" DROP CONSTRAINT "WarehouseSupplyOrder_warehouseId_fkey";

-- AlterTable
ALTER TABLE "public"."Employed" DROP COLUMN "endedAt",
DROP COLUMN "hiredAt";

-- AlterTable
ALTER TABLE "public"."SupplyOrder" ADD COLUMN     "storeId" TEXT,
ADD COLUMN     "warehouseId" TEXT;

-- DropTable
DROP TABLE "public"."StoreSupplyOrder";

-- DropTable
DROP TABLE "public"."WarehouseSupplyOrder";

-- CreateTable
CREATE TABLE "public"."ProductBatch" (
    "id" TEXT NOT NULL,
    "warehouseProductId" TEXT,
    "storeProductId" TEXT,
    "quantity" INTEGER NOT NULL,
    "productionDate" TIMESTAMP(3),
    "expirationDate" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StoreReception" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "supplyOrderId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreReception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StoreReceptionProduct" (
    "id" TEXT NOT NULL,
    "storeReceptionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreReceptionProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WarehouseReceptionProduct" (
    "id" TEXT NOT NULL,
    "warehouseReceptionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseReceptionProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmployedHistory" (
    "id" TEXT NOT NULL,
    "employedId" TEXT NOT NULL,
    "hiredAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployedHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WarehouseProduct" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "stockThreshold" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WarehouseReception" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "supplyOrderId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseReception_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseProduct_warehouseId_productId_key" ON "public"."WarehouseProduct"("warehouseId", "productId");

-- AddForeignKey
ALTER TABLE "public"."ProductBatch" ADD CONSTRAINT "ProductBatch_warehouseProductId_fkey" FOREIGN KEY ("warehouseProductId") REFERENCES "public"."WarehouseProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductBatch" ADD CONSTRAINT "ProductBatch_storeProductId_fkey" FOREIGN KEY ("storeProductId") REFERENCES "public"."StoreProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StoreReception" ADD CONSTRAINT "StoreReception_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StoreReception" ADD CONSTRAINT "StoreReception_supplyOrderId_fkey" FOREIGN KEY ("supplyOrderId") REFERENCES "public"."SupplyOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StoreReception" ADD CONSTRAINT "StoreReception_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StoreReceptionProduct" ADD CONSTRAINT "StoreReceptionProduct_storeReceptionId_fkey" FOREIGN KEY ("storeReceptionId") REFERENCES "public"."StoreReception"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StoreReceptionProduct" ADD CONSTRAINT "StoreReceptionProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WarehouseReceptionProduct" ADD CONSTRAINT "WarehouseReceptionProduct_warehouseReceptionId_fkey" FOREIGN KEY ("warehouseReceptionId") REFERENCES "public"."WarehouseReception"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WarehouseReceptionProduct" ADD CONSTRAINT "WarehouseReceptionProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmployedHistory" ADD CONSTRAINT "EmployedHistory_employedId_fkey" FOREIGN KEY ("employedId") REFERENCES "public"."Employed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmployedHistory" ADD CONSTRAINT "EmployedHistory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplyOrder" ADD CONSTRAINT "SupplyOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "public"."Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplyOrder" ADD CONSTRAINT "SupplyOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WarehouseProduct" ADD CONSTRAINT "WarehouseProduct_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "public"."Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WarehouseProduct" ADD CONSTRAINT "WarehouseProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WarehouseReception" ADD CONSTRAINT "WarehouseReception_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "public"."Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WarehouseReception" ADD CONSTRAINT "WarehouseReception_supplyOrderId_fkey" FOREIGN KEY ("supplyOrderId") REFERENCES "public"."SupplyOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WarehouseReception" ADD CONSTRAINT "WarehouseReception_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
