-- CreateEnum
CREATE TYPE "public"."CurrencyCode" AS ENUM ('PEN', 'USD', 'EUR');

-- AlterTable
ALTER TABLE "public"."Tenant" ADD COLUMN     "currency" "public"."CurrencyCode" DEFAULT 'PEN';
