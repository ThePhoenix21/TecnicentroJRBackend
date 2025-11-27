/*
  Warnings:

  - You are about to drop the column `userId` on the `Store` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Store" DROP CONSTRAINT "Store_userId_fkey";

-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "cashSessionsId" TEXT;

-- AlterTable
ALTER TABLE "public"."Store" DROP COLUMN "userId",
ADD COLUMN     "createdById" TEXT;

-- CreateTable
CREATE TABLE "public"."StoreUsers" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "StoreUsers_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_cashSessionsId_fkey" FOREIGN KEY ("cashSessionsId") REFERENCES "public"."CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Store" ADD CONSTRAINT "Store_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StoreUsers" ADD CONSTRAINT "StoreUsers_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StoreUsers" ADD CONSTRAINT "StoreUsers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
