import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import { errorHandler } from './middleware/errorHandler.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import examRoutes from './routes/examRoutes.js';
import formRoutes from './routes/formRoutes.js';
import centerRoutes, { programRoutes } from './routes/centerRoutes.js';
import userRoutes from './routes/userRoutes.js';
import activityRoutes from './routes/activityRoutes.js';
import authRoutes from './routes/auth.route.js';
import reportRoutes from './routes/reportRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import studentRoutes from './routes/student.route.js';
import skillRoutes from './routes/skillRoutes.js';
import announcementRoutes from './routes/announcementRoutes.js';
import koboRoutes from './routes/kobo.routes.js';

import path from "path";
import { fileURLToPath } from "url";

const app = express();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 100 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || process.env.NODE_ENV === "production" || origin.startsWith("http://localhost:")) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());
app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    status: "ok",
  });
});

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
app.use("/api/reports", reportRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/skills", skillRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/kobo", koboRoutes);

// Resolve __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to frontend build — only used in production
if (process.env.NODE_ENV === "production") {
  const frontendPath = path.join(__dirname, "../../frontend/dist");

  app.use(express.static(frontendPath));

<<<<<<< HEAD
  app.use((req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ message: 'API route not found' });
    }

=======
  // Use a named parameter with a regex to catch everything
  // This satisfies the new 'path-to-regexp' requirements
  app.get('/{*path}', (req, res) => {
>>>>>>> origin/vansh
    res.sendFile(path.join(frontendPath, "index.html"));
  });
}

app.use(errorHandler);

export default app;
