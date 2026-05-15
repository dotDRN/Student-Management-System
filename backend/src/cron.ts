import cron from 'node-cron';
import prisma from './lib/prisma.js';

export function startCronJobs() {
  console.log("Starting cron jobs...");

  // Run every day at 23:59
  cron.schedule('59 23 * * *', async () => {
    console.log("Running auto-submit attendance cron job...");
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

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
    } catch (error) {
      console.error("Error running auto-submit attendance cron job:", error);
    }
  });
}
