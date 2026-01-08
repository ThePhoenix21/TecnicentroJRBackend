-- CreateTable
CREATE TABLE "public"."OrderHardDeleteAudit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "executedByUserId" TEXT NOT NULL,
    "executedByEmail" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "deletedOrdersCount" INTEGER NOT NULL,
    "ipAddress" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderHardDeleteAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderHardDeleteAudit_tenantId_createdAt_idx" ON "public"."OrderHardDeleteAudit"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."OrderHardDeleteAudit" ADD CONSTRAINT "OrderHardDeleteAudit_executedByUserId_fkey" FOREIGN KEY ("executedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
