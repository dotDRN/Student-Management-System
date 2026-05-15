-- AlterTable
ALTER TABLE "form_submissions" ADD COLUMN     "koboSubmissionId" TEXT;

-- AlterTable
ALTER TABLE "form_templates" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "externalSource" TEXT;
