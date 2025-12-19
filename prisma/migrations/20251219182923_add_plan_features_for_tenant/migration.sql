-- CreateEnum
CREATE TYPE "public"."TenantPlan" AS ENUM ('FREE', 'BASIC', 'PRO');

-- CreateEnum
CREATE TYPE "public"."TenantFeature" AS ENUM ('DASHBOARD', 'STORE', 'CASH', 'SALES', 'SERVICES', 'PRODUCTS', 'INVENTORY', 'CLIENTS', 'CONFIG');

-- AlterTable
ALTER TABLE "public"."Tenant" ADD COLUMN     "features" "public"."TenantFeature"[],
ADD COLUMN     "plan" "public"."TenantPlan" NOT NULL DEFAULT 'FREE';
