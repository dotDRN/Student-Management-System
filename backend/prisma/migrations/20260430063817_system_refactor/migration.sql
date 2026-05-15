/*
  Warnings:

  - You are about to drop the `message_threads` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `messages` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `thread_participants` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `exam_type` on the `exams` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "message_threads" DROP CONSTRAINT "message_threads_center_id_fkey";

-- DropForeignKey
ALTER TABLE "message_threads" DROP CONSTRAINT "message_threads_created_by_fkey";

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_sender_id_fkey";

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_thread_id_fkey";

-- DropForeignKey
ALTER TABLE "thread_participants" DROP CONSTRAINT "thread_participants_thread_id_fkey";

-- DropForeignKey
ALTER TABLE "thread_participants" DROP CONSTRAINT "thread_participants_user_id_fkey";

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "volunteers" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "attendance_sessions" ADD COLUMN     "is_holiday" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "exam_scores" ADD COLUMN     "is_absent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "exams" ALTER COLUMN "exam_type" TYPE TEXT USING "exam_type"::text;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "college_name" TEXT,
ADD COLUMN     "education_discontinued" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "post_12th_choice" TEXT,
ADD COLUMN     "stream" TEXT;

-- DropTable
DROP TABLE "message_threads";

-- DropTable
DROP TABLE "messages";

-- DropTable
DROP TABLE "thread_participants";

-- DropEnum
DROP TYPE "ExamType";

-- CreateTable
CREATE TABLE "activity_enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activity_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested_by_teacher',
    "requested_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "activity_enrollments_activity_id_student_id_key" ON "activity_enrollments"("activity_id", "student_id");

-- AddForeignKey
ALTER TABLE "activity_enrollments" ADD CONSTRAINT "activity_enrollments_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_enrollments" ADD CONSTRAINT "activity_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_enrollments" ADD CONSTRAINT "activity_enrollments_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
