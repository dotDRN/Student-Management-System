/**
 * Resolves allowed CORS origins for Express and Socket.IO across local dev,
 * single-service Render deploys, and split-origin deployments.
 */
export function getAllowedOrigins(): string[] {
  const rawValues = [
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGINS,
    process.env.RENDER_EXTERNAL_URL,
  ];

  const origins = new Set<string>();
  for (const raw of rawValues) {
    if (!raw) continue;
    for (const entry of raw.split(",")) {
      const normalized = entry.trim().replace(/\/+$/, "");
      if (normalized) {
        origins.add(normalized);
      }
    }
  }

  return Array.from(origins);
}

export function isOriginAllowed(origin?: string): boolean {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = origin.trim().replace(/\/+$/, "");

  if (process.env.NODE_ENV !== "production") {
    if (
      normalizedOrigin.startsWith("http://localhost:") ||
      normalizedOrigin.startsWith("http://127.0.0.1:")
    ) {
      return true;
    }
  }

  const allowedOrigins = getAllowedOrigins();
  return allowedOrigins.includes(normalizedOrigin);
}
