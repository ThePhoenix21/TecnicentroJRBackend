-- CreateEnum
CREATE TYPE "public"."ServiceStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'DELIVERED', 'PAID');

-- AlterTable
ALTER TABLE "public"."Service" ADD COLUMN     "deliveryNotes" TEXT,
ADD COLUMN     "status" "public"."ServiceStatus" NOT NULL DEFAULT 'IN_PROGRESS';
