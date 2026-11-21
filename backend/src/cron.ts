import cron from "node-cron";
import prisma from "./lib/prisma.js";
import { evaluateAlertRules } from "./services/alertService.js";
import { getTodayUtcDateOnly } from "./utils/dateOnly.js";

export function startCronJobs() {
  console.log("Starting cron jobs...");

  // Run every day at 23:59
  cron.schedule("59 23 * * *", async () => {
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

      console.log(`Auto-submitted attendance. Marked ${result.count} pending records as absent.`);

      const alertSummary = await evaluateAlertRules();
      console.log(
        `Evaluated ${alertSummary.evaluatedRules} alert rule(s) across ${alertSummary.evaluatedStudents} active student(s); created ${alertSummary.createdAlerts} alert(s).`,
      );
    } catch (error) {
      console.error("Error running nightly attendance and alert cron job:", error);
    }
  });
}
