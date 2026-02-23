-- AlterTable
ALTER TABLE "public"."EmployedHistory" ADD COLUMN     "updatedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "public"."EmployedHistory" ADD CONSTRAINT "EmployedHistory_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
