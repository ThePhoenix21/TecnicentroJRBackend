/*
  Warnings:

  - You are about to drop the column `documentUrls` on the `Employed` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "public"."DocumentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DELETED');

-- AlterTable
ALTER TABLE "public"."Employed" DROP COLUMN "documentUrls";

-- CreateTable
CREATE TABLE "public"."EmployeeDocument" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "status" "public"."DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "size" INTEGER NOT NULL,
    "employedId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_employedId_fkey" FOREIGN KEY ("employedId") REFERENCES "public"."Employed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
