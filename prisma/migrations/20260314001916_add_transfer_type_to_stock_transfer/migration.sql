/*
  Warnings:

  - Added the required column `transferType` to the `StockTransfer` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TransferType" AS ENUM ('REQUEST', 'SEND');

-- AlterTable
ALTER TABLE "StockTransfer" ADD COLUMN     "transferType" "TransferType" NOT NULL;
