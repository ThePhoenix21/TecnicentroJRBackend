-- AlterTable
ALTER TABLE "public"."Employed" ADD COLUMN     "documentUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
