-- AlterTable
ALTER TABLE "public"."Service" ALTER COLUMN "type" SET DEFAULT 'MISELANEOUS';

-- AlterTable
ALTER TABLE "public"."Tenant" ALTER COLUMN "defaultService" SET DEFAULT 'MISELANEOUS';
