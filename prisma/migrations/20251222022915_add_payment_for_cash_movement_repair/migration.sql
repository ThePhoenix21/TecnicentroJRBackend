/*
  Warnings:

  - The `payment` column on the `CashMovement` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."CashMovement" DROP COLUMN "payment",
ADD COLUMN     "payment" "public"."PaymentType";
