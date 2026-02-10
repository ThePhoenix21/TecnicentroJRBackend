-- DropForeignKey
ALTER TABLE "public"."StoreService" DROP CONSTRAINT "StoreService_ServiceCategoryId_fkey";

-- AlterTable
ALTER TABLE "public"."StoreService" ALTER COLUMN "ServiceCategoryId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."StoreService" ADD CONSTRAINT "StoreService_ServiceCategoryId_fkey" FOREIGN KEY ("ServiceCategoryId") REFERENCES "public"."ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
