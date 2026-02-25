-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TenantFeature" ADD VALUE 'SUPPORT';
ALTER TYPE "TenantFeature" ADD VALUE 'WAREHOUSES';
ALTER TYPE "TenantFeature" ADD VALUE 'EMPLOYEES';
ALTER TYPE "TenantFeature" ADD VALUE 'SUPPLIERS';
ALTER TYPE "TenantFeature" ADD VALUE 'SUPPLY_ORDERS';
ALTER TYPE "TenantFeature" ADD VALUE 'USERS';
