/*
  Warnings:

  - A unique constraint covering the columns `[externalId]` on the table `form_templates` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "form_templates_externalId_key" ON "form_templates"("externalId");
