-- CreateEnum
CREATE TYPE "public"."SessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."MovementType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateTable
CREATE TABLE "public"."CashSession" (
    "id" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openedById" TEXT NOT NULL,
    "closedById" TEXT,
    "status" "public"."SessionStatus" NOT NULL DEFAULT 'OPEN',
    "openingAmount" DOUBLE PRECISION NOT NULL,
    "closingAmount" DOUBLE PRECISION,
    "StoreId" TEXT NOT NULL,
    "UserId" TEXT NOT NULL,

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CashMovement" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "public"."MovementType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "relatedOrderId" TEXT,
    "CashSessionId" TEXT NOT NULL,
    "UserId" TEXT NOT NULL,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."CashSession" ADD CONSTRAINT "CashSession_StoreId_fkey" FOREIGN KEY ("StoreId") REFERENCES "public"."Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CashSession" ADD CONSTRAINT "CashSession_UserId_fkey" FOREIGN KEY ("UserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CashMovement" ADD CONSTRAINT "CashMovement_relatedOrderId_fkey" FOREIGN KEY ("relatedOrderId") REFERENCES "public"."Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CashMovement" ADD CONSTRAINT "CashMovement_CashSessionId_fkey" FOREIGN KEY ("CashSessionId") REFERENCES "public"."CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CashMovement" ADD CONSTRAINT "CashMovement_UserId_fkey" FOREIGN KEY ("UserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Store" ADD CONSTRAINT "Store_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
