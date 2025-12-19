-- CreateEnum
CREATE TYPE "public"."TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

-- AlterTable
ALTER TABLE "public"."Tenant" ADD COLUMN     "status" "public"."TenantStatus" NOT NULL DEFAULT 'ACTIVE';
