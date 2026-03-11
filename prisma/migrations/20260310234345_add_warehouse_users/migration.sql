-- CreateTable
CREATE TABLE "public"."WarehouseUsers" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "WarehouseUsers_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."WarehouseUsers" ADD CONSTRAINT "WarehouseUsers_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "public"."Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WarehouseUsers" ADD CONSTRAINT "WarehouseUsers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
