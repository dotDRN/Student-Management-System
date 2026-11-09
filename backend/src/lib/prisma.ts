import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { getCurrentTenantId } from "./tenantContext.js";

const DIRECT_TENANT_MODELS = new Set([
  "AcademicYear",
  "Center",
  "Program",
  "User",
  "FormTemplate",
  "Announcement",
  "AlertRule",
  "AuditLog",
  "Conversation",
  "Notification",
]);

const CENTER_SCOPED_MODELS = new Set([
  "Student",
  "Activity",
  "Batch",
  "AttendanceSession",
  "AttendanceRecord",
  "Exam",
  "ExamScore",
  "StudentSkillLog",
  "FormSubmission",
  "Equipment",
  "EquipmentLog",
  "Alert",
  "ActivityStatusLog",
]);

const WHERE_SCOPED_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

function createExtendedPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const basePrisma = new PrismaClient({ adapter });

  const extended = basePrisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const tenantId = getCurrentTenantId();
          if (!tenantId || !model) {
            return query(args);
          }

          const mutableArgs = (args ?? {}) as Record<string, any>;

          if (DIRECT_TENANT_MODELS.has(model)) {
            if (WHERE_SCOPED_OPS.has(operation)) {
              const where = (mutableArgs.where ?? {}) as Record<string, any>;
              mutableArgs.where = {
                ...where,
                tenantId: where.tenantId ?? tenantId,
              };
            } else if (operation === "create") {
              const data = (mutableArgs.data ?? {}) as Record<string, any>;
              if (!data.tenantId && !data.organization) {
                mutableArgs.data = { ...data, tenantId };
              }
            } else if (
              operation === "createMany" ||
              operation === "createManyAndReturn"
            ) {
              if (Array.isArray(mutableArgs.data)) {
                mutableArgs.data = mutableArgs.data.map(
                  (item: Record<string, any>) => ({
                    ...item,
                    tenantId: item.tenantId ?? tenantId,
                  }),
                );
              } else if (
                mutableArgs.data &&
                typeof mutableArgs.data === "object"
              ) {
                mutableArgs.data = {
                  ...mutableArgs.data,
                  tenantId: mutableArgs.data.tenantId ?? tenantId,
                };
              }
            } else if (operation === "upsert" && mutableArgs.create) {
              const createData = mutableArgs.create as Record<string, any>;
              if (!createData.tenantId && !createData.organization) {
                mutableArgs.create = { ...createData, tenantId };
              }
            }
          } else if (
            CENTER_SCOPED_MODELS.has(model) &&
            WHERE_SCOPED_OPS.has(operation)
          ) {
            const where = (mutableArgs.where ?? {}) as Record<string, any>;
            const existingCenter =
              where.center && typeof where.center === "object"
                ? (where.center as Record<string, any>)
                : {};
            mutableArgs.where = {
              ...where,
              center: {
                ...existingCenter,
                tenantId: existingCenter.tenantId ?? tenantId,
              },
            };
          }

          return query(mutableArgs);
        },
      },
    },
  });

  return extended as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const prisma = globalForPrisma.prisma ?? createExtendedPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
