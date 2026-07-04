import "dotenv/config";
import { createServer } from "http";
import app from "./app.js";
import { startCronJobs } from "./cron.js";
import { initializeSocket } from "./socket/index.js";

const PORT = Number(process.env.PORT) || 5000;

startCronJobs();

const httpServer = createServer(app);

initializeSocket(httpServer);

httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});