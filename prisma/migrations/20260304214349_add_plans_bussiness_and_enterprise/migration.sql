/*
  Warnings:

  - The values [BASIC] on the enum `TenantPlan` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "TenantPlan_new" AS ENUM ('FREE', 'BUSSINESS', 'PRO', 'ENTERPRISE');
ALTER TABLE "public"."Tenant" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "Tenant" ALTER COLUMN "plan" TYPE "TenantPlan_new" USING ("plan"::text::"TenantPlan_new");
ALTER TYPE "TenantPlan" RENAME TO "TenantPlan_old";
ALTER TYPE "TenantPlan_new" RENAME TO "TenantPlan";
DROP TYPE "public"."TenantPlan_old";
ALTER TABLE "Tenant" ALTER COLUMN "plan" SET DEFAULT 'FREE';
COMMIT;
