-- CreateTable
CREATE TABLE "public"."ApiMetric" (
    "id" TEXT NOT NULL,
    "intervalStart" TIMESTAMP(3) NOT NULL,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 1,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "requestsCount" INTEGER NOT NULL,
    "errorsCount" INTEGER NOT NULL,
    "avgLatencyMs" DOUBLE PRECISION,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiMetric_intervalStart_idx" ON "public"."ApiMetric"("intervalStart");

-- CreateIndex
CREATE INDEX "ApiMetric_endpoint_idx" ON "public"."ApiMetric"("endpoint");

-- CreateIndex
CREATE INDEX "ApiMetric_tenantId_idx" ON "public"."ApiMetric"("tenantId");
