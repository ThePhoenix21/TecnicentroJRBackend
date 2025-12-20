/*
  Warnings:

  - The values [DEFAULTSERVICE] on the enum `TenantFeature` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."TenantFeature_new" AS ENUM ('DASHBOARD', 'STORE', 'CASH', 'SALES', 'SALESOFPRODUCTS', 'SALESOFSERVICES', 'SERVICES', 'PRODUCTS', 'INVENTORY', 'CLIENTS', 'CONFIG');
ALTER TABLE "public"."Tenant" ALTER COLUMN "features" TYPE "public"."TenantFeature_new"[] USING ("features"::text::"public"."TenantFeature_new"[]);
ALTER TYPE "public"."TenantFeature" RENAME TO "TenantFeature_old";
ALTER TYPE "public"."TenantFeature_new" RENAME TO "TenantFeature";
DROP TYPE "public"."TenantFeature_old";
COMMIT;

-- AlterTable
ALTER TABLE "public"."Tenant" ADD COLUMN     "defaultService" "public"."ServiceType" DEFAULT 'REPAIR';
