import type { ErrorRequestHandler } from "express";
import { AppError } from '../lib/errors.js';

function isDatabaseConnectivityError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const candidate = err as { name?: string; code?: string; message?: string };
  if (
    candidate.name === "PrismaClientInitializationError" ||
    candidate.name === "PrismaClientRustPanicError"
  ) {
    return true;
  }
  if (typeof candidate.code === "string" && /^P10(0[0-9]|1[0-7])$/.test(candidate.code)) {
    return true;
  }
  if (
    typeof candidate.message === "string" &&
    /can't reach database|database server|econnrefused|etimedout|connection terminated|connection closed|server has closed the connection|timeout expired/i.test(
      candidate.message,
    )
  ) {
    return true;
  }
  return false;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
  }

  if (isDatabaseConnectivityError(err)) {
    return res.status(503).json({
      success: false,
      code: "DB_UNAVAILABLE",
      error: "Database is currently offline. Using local device storage.",
    });
  }

  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message || "Internal server error";

  console.error('Unhandled Error:', err);
  return res.status(500).json({
    success: false,
    error: message,
  });
};
