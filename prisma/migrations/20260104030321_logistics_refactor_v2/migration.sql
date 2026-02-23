/*
  Warnings:

  - You are about to alter the column `avgLatencyMs` on the `ApiMetric` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `amount` on the `CashMovement` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `openingAmount` on the `CashSession` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `closingAmount` on the `CashSession` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `declaredAmount` on the `CashSession` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `totalAmount` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `price` on the `OrderProduct` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `buycost` on the `OrderProduct` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `amount` on the `Payment` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `amount` on the `PaymentMethod` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `basePrice` on the `Product` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `buyCost` on the `Product` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `buyCost` on the `ProviderProduct` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `price` on the `Service` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `price` on the `StoreProduct` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.

*/
-- DropForeignKey
ALTER TABLE "public"."Client" DROP CONSTRAINT "Client_userId_fkey";

-- AlterTable
ALTER TABLE "public"."ApiMetric" ALTER COLUMN "avgLatencyMs" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "public"."CashMovement" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "public"."CashSession" ALTER COLUMN "openingAmount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "closingAmount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "declaredAmount" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "public"."InventoryMovement" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "public"."Order" ALTER COLUMN "orderNumber" DROP DEFAULT,
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "public"."OrderProduct" ALTER COLUMN "price" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "buycost" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "public"."Payment" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "public"."PaymentMethod" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "public"."Product" ALTER COLUMN "basePrice" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "buyCost" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "public"."ProviderProduct" ALTER COLUMN "buyCost" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "public"."Service" ALTER COLUMN "price" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "public"."StoreProduct" ADD COLUMN     "tenantId" TEXT,
ALTER COLUMN "price" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "public"."StoreReception" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "public"."SupplyOrder" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "public"."WarehouseProduct" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "public"."WarehouseReception" ADD COLUMN     "tenantId" TEXT;

-- AddForeignKey
ALTER TABLE "public"."StoreProduct" ADD CONSTRAINT "StoreProduct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Client" ADD CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StoreReception" ADD CONSTRAINT "StoreReception_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryMovement" ADD CONSTRAINT "InventoryMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplyOrder" ADD CONSTRAINT "SupplyOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WarehouseProduct" ADD CONSTRAINT "WarehouseProduct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WarehouseReception" ADD CONSTRAINT "WarehouseReception_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
