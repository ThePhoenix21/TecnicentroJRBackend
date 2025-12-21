-- Add tenantId to Client
ALTER TABLE "public"."Client" ADD COLUMN "tenantId" TEXT;

-- Backfill tenantId from the creator user
UPDATE "public"."Client" AS c
SET "tenantId" = u."tenantId"
FROM "public"."User" AS u
WHERE c."userId" = u."id" AND c."tenantId" IS NULL;

-- Drop old global unique indexes
DROP INDEX IF EXISTS "public"."Client_email_key";
DROP INDEX IF EXISTS "public"."Client_ruc_key";
DROP INDEX IF EXISTS "public"."Client_dni_key";

-- Create new tenant-scoped unique indexes
CREATE UNIQUE INDEX "Client_tenantId_dni_key" ON "public"."Client"("tenantId", "dni");
CREATE UNIQUE INDEX "Client_tenantId_email_key" ON "public"."Client"("tenantId", "email");
CREATE UNIQUE INDEX "Client_tenantId_ruc_key" ON "public"."Client"("tenantId", "ruc");

-- AddForeignKey
ALTER TABLE "public"."Client" ADD CONSTRAINT "Client_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
