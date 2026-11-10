-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo_url" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- Seed Default Organization to preserve all existing single-tenant records
INSERT INTO "organizations" ("id", "name", "slug", "plan", "is_active", "created_at", "updated_at")
VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Default Organization',
    'default',
    'starter',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

-- DropIndex
DROP INDEX IF EXISTS "academic_years_label_key";

-- DropIndex
DROP INDEX IF EXISTS "form_templates_externalId_key";

-- DropIndex
DROP INDEX IF EXISTS "programs_code_key";

-- DropIndex
DROP INDEX IF EXISTS "users_email_key";

-- AlterTable
ALTER TABLE "academic_years" ADD COLUMN "tenant_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

-- AlterTable
ALTER TABLE "alert_rules" ADD COLUMN "tenant_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN "tenant_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN "tenant_id" UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

-- AlterTable
ALTER TABLE "centers" ADD COLUMN "tenant_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "tenant_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

-- AlterTable
ALTER TABLE "form_templates" ADD COLUMN "tenant_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "tenant_id" UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

-- AlterTable
ALTER TABLE "programs" ADD COLUMN "tenant_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

-- AlterTable
ALTER TABLE "push_subscriptions" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "tenant_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

-- CreateIndex
CREATE INDEX "academic_years_tenant_id_idx" ON "academic_years"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_tenant_id_label_key" ON "academic_years"("tenant_id", "label");

-- CreateIndex
CREATE INDEX "alert_rules_tenant_id_idx" ON "alert_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "announcements_tenant_id_idx" ON "announcements"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_idx" ON "audit_log"("tenant_id");

-- CreateIndex
CREATE INDEX "centers_tenant_id_idx" ON "centers"("tenant_id");

-- CreateIndex
CREATE INDEX "conversations_tenant_id_idx" ON "conversations"("tenant_id");

-- CreateIndex
CREATE INDEX "form_templates_tenant_id_idx" ON "form_templates"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "form_templates_tenant_id_externalId_key" ON "form_templates"("tenant_id", "externalId");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_idx" ON "notifications"("tenant_id");

-- CreateIndex
CREATE INDEX "programs_tenant_id_idx" ON "programs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "programs_tenant_id_code_key" ON "programs"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "centers" ADD CONSTRAINT "centers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_templates" ADD CONSTRAINT "form_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
