-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "TransferStatus" AS ENUM ('active', 'pending_transfer', 'transferred');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "created_by" UUID,
ADD COLUMN     "fees_paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "is_fully_paid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "total_fees" DECIMAL(10,2),
ADD COLUMN     "transfer_status" "TransferStatus" NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE "fee_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "paid_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "fee_payments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
