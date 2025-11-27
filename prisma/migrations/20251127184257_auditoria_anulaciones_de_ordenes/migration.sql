-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "canceledById" TEXT;

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
