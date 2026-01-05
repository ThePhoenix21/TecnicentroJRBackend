/*
  Warnings:

  - A unique constraint covering the columns `[createdByUserId,document]` on the table `Employed` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Employed_createdByUserId_document_key" ON "public"."Employed"("createdByUserId", "document");
