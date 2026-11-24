import "dotenv/config";
import { createServer } from "node:http";
import app from "./app.js";
import { startCronJobs } from "./cron.js";
import { closeDatabaseConnections } from "./lib/prisma.js";
import { initializeSocket } from "./socket/index.js";

const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
] as const;

const missingEnv = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
if (missingEnv.length > 0) {
  console.error(
    `Missing required environment variable(s): ${missingEnv.join(", ")}`,
  );
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 5000;

const cronTask = startCronJobs();
const httpServer = createServer(app);
const io = initializeSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`${signal} received. Starting graceful shutdown...`);

  const forceTimer = setTimeout(() => {
    console.error("Graceful shutdown timed out; forcing exit.");
    process.exit(1);
  }, 10_000);
  forceTimer.unref();

  try {
    cronTask.stop();
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    await closeDatabaseConnections();
    console.log("Graceful shutdown complete.");
    process.exit(0);
  } catch (err) {
    console.error("Error during graceful shutdown:", err);
    process.exit(1);
  }
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
