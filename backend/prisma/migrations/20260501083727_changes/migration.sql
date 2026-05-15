-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED');

-- AlterTable
ALTER TABLE "exam_scores" ADD COLUMN     "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT';
