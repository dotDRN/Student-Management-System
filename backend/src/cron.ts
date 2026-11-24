import cron, { type ScheduledTask } from "node-cron";
import prisma from "./lib/prisma.js";
import { runWithTenantContext } from "./lib/tenantContext.js";
import { evaluateAlertRules } from "./services/alertService.js";
import { getTodayUtcDateOnly } from "./utils/dateOnly.js";

export function startCronJobs(): ScheduledTask {
  const timezone = process.env.APP_TIMEZONE || "UTC";
  console.log(`Starting cron jobs (timezone: ${timezone})...`);

  // Run every day at 23:59 in configured application timezone
  return cron.schedule(
    "59 23 * * *",
    async () => {
      console.log("Running auto-submit attendance & risk evaluation cron job...");
      try {
        const today = getTodayUtcDateOnly();

        const result = await prisma.attendanceRecord.updateMany({
          where: {
            status: "pending",
            session: {
              sessionDate: today,
              isHoliday: false,
            },
          },
          data: {
            status: "absent",
          },
        });

        console.log(
          `Auto-submitted attendance. Marked ${result.count} pending records as absent.`,
        );

        const activeOrgs = await prisma.organization.findMany({
          where: { isActive: true },
          select: { id: true },
        });

        let evaluatedRules = 0;
        let evaluatedStudents = 0;
        let createdAlerts = 0;

        for (const org of activeOrgs) {
          const summary = await runWithTenantContext({ tenantId: org.id }, () =>
            evaluateAlertRules(),
          );
          evaluatedRules += summary.evaluatedRules;
          evaluatedStudents += summary.evaluatedStudents;
          createdAlerts += summary.createdAlerts;
        }

        console.log(
          `Evaluated ${evaluatedRules} alert rule(s) across ${evaluatedStudents} active student(s) in ${activeOrgs.length} tenant(s); created ${createdAlerts} alert(s).`,
        );
      } catch (error) {
        console.error("Error running nightly attendance and alert cron job:", error);
      }
    },
    { timezone },
  );
}
