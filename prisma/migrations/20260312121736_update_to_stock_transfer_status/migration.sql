/*
  Warnings:

  - The values [CANCELLED] on the enum `StockTransferStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "StockTransferStatus_new" AS ENUM ('ISSUED', 'PENDING', 'COMPLETED', 'PARTIAL', 'PARTIALLY_RECEIVED', 'ANNULLATED');
ALTER TABLE "public"."StockTransfer" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "StockTransfer" ALTER COLUMN "status" TYPE "StockTransferStatus_new" USING ("status"::text::"StockTransferStatus_new");
ALTER TYPE "StockTransferStatus" RENAME TO "StockTransferStatus_old";
ALTER TYPE "StockTransferStatus_new" RENAME TO "StockTransferStatus";
DROP TYPE "public"."StockTransferStatus_old";
ALTER TABLE "StockTransfer" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;
