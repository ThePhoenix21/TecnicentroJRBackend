-- DropForeignKey
ALTER TABLE "public"."Store" DROP CONSTRAINT "Store_tenantId_fkey";

-- AlterTable
ALTER TABLE "public"."Store" ALTER COLUMN "tenantId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."Store" ADD CONSTRAINT "Store_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
