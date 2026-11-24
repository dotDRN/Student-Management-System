import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import { errorHandler } from './middleware/errorHandler.js';
import prisma from './lib/prisma.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import examRoutes from './routes/examRoutes.js';
import formRoutes from './routes/formRoutes.js';
import centerRoutes, { programRoutes } from './routes/centerRoutes.js';
import userRoutes from './routes/userRoutes.js';
import academicYearRoutes from './routes/academicYearRoutes.js';
import activityRoutes from './routes/activityRoutes.js';
import alertRoutes from './routes/alertRoutes.js';
import batchRoutes from './routes/batchRoutes.js';
import parentPortalRoutes from './routes/parentPortalRoutes.js';
import authRoutes from './routes/auth.route.js';
import reportRoutes from './routes/reportRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import studentRoutes from './routes/student.route.js';
import skillRoutes from './routes/skillRoutes.js';
import announcementRoutes from './routes/announcementRoutes.js';
import koboRoutes from './routes/kobo.routes.js';

import notificationRoutes from './routes/notification.routes.js';
import syncRoutes from './routes/syncRoutes.js';

import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import { isOriginAllowed } from "./config/cors.js";
import attachmentRoutes from "./routes/attachment.routes.js";
import reactionRoutes from "./routes/reaction.routes.js";
import conversationRoutes from "./routes/conversation.routes.js";
import messageRoutes from "./routes/message.routes.js";
import messageItemRoutes from "./routes/message-item.route.js";

const app = express();
app.set("trust proxy", 1);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 100 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https:"],
        connectSrc: ["'self'", "https:", "wss:", "ws:"],
        mediaSrc: ["'self'", "blob:", "https://res.cloudinary.com"],
        workerSrc: ["'self'", "blob:"],
      },
    },
  }),
);
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.get("/health/live", (_req, res) => {
  return res.status(200).json({
    success: true,
    status: "alive",
  });
});
app.get("/health", async (_req, res) => {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("DB health check timeout")), 5000),
      ),
    ]);
    return res.status(200).json({
      success: true,
      status: "ok",
    });
  } catch {
    return res.status(503).json({
      success: false,
      status: "db_offline",
      code: "DB_UNAVAILABLE",
      error: "Database is currently unreachable.",
    });
  }
});

const syncLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 300 : 10000,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/sync", syncLimiter, syncRoutes);
app.use(limiter);

app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/forms", formRoutes);
app.use("/api/centers", centerRoutes);
app.use("/api/programs", programRoutes);
app.use("/api/users", userRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/batches", batchRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/academic-years", academicYearRoutes);
app.use("/api/parent", parentPortalRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/skills", skillRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/kobo", koboRoutes);
app.use("/api/chat/conversations", conversationRoutes);
app.use("/api/chat/conversations", messageRoutes);
app.use("/api/chat/messages", messageItemRoutes);
app.use("/api/chat/messages", reactionRoutes);
app.use("/api/chat/attachments", attachmentRoutes);
app.use("/api/notifications", notificationRoutes);

// Resolve __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const frontendPath = path.join(__dirname, "../../frontend/dist");
const frontendIndex = path.join(frontendPath, "index.html");

if (process.env.NODE_ENV === "production" && fs.existsSync(frontendIndex)) {
  app.use(express.static(frontendPath));

  // Catch all non-API routes and serve the frontend SPA
  app.get("/{*path}", (req, res) => {
    if (req.path.startsWith("/api")) {
      return res.status(404).json({
        message: "API route not found",
      });
    }

    res.sendFile(frontendIndex);
  });
}

app.use(errorHandler);

export default app;
