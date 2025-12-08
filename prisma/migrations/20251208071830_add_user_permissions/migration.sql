-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];
