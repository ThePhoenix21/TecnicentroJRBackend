-- CreateEnum
CREATE TYPE "public"."SupplyOrderStatus" AS ENUM ('ISSUED', 'PENDING', 'RECEIVED', 'DELIVERED', 'COMPLETED', 'ANNULLATED');

-- CreateTable
CREATE TABLE "public"."Provider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruc" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupplyOrder" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "public"."SupplyOrderStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "providerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "SupplyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupplyOrderProduct" (
    "id" TEXT NOT NULL,
    "supplyOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "SupplyOrderProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProviderProduct" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "buyCost" DOUBLE PRECISION,

    CONSTRAINT "ProviderProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WarehouseSupplyOrder" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "supplyOrderId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "WarehouseSupplyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StoreSupplyOrder" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "supplyOrderId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "StoreSupplyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Provider_createdById_ruc_key" ON "public"."Provider"("createdById", "ruc");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyOrder_createdById_code_key" ON "public"."SupplyOrder"("createdById", "code");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyOrderProduct_supplyOrderId_productId_key" ON "public"."SupplyOrderProduct"("supplyOrderId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderProduct_providerId_productId_key" ON "public"."ProviderProduct"("providerId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseSupplyOrder_warehouseId_supplyOrderId_key" ON "public"."WarehouseSupplyOrder"("warehouseId", "supplyOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSupplyOrder_storeId_supplyOrderId_key" ON "public"."StoreSupplyOrder"("storeId", "supplyOrderId");

-- AddForeignKey
ALTER TABLE "public"."Provider" ADD CONSTRAINT "Provider_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplyOrder" ADD CONSTRAINT "SupplyOrder_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "public"."Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplyOrder" ADD CONSTRAINT "SupplyOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplyOrderProduct" ADD CONSTRAINT "SupplyOrderProduct_supplyOrderId_fkey" FOREIGN KEY ("supplyOrderId") REFERENCES "public"."SupplyOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplyOrderProduct" ADD CONSTRAINT "SupplyOrderProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProviderProduct" ADD CONSTRAINT "ProviderProduct_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "public"."Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProviderProduct" ADD CONSTRAINT "ProviderProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WarehouseSupplyOrder" ADD CONSTRAINT "WarehouseSupplyOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "public"."Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WarehouseSupplyOrder" ADD CONSTRAINT "WarehouseSupplyOrder_supplyOrderId_fkey" FOREIGN KEY ("supplyOrderId") REFERENCES "public"."SupplyOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StoreSupplyOrder" ADD CONSTRAINT "StoreSupplyOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StoreSupplyOrder" ADD CONSTRAINT "StoreSupplyOrder_supplyOrderId_fkey" FOREIGN KEY ("supplyOrderId") REFERENCES "public"."SupplyOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
