const rawApiUrl = (import.meta.env.VITE_API_URL || "/api")
  .trim()
  .replace(/\/+$/, "");

export const API_BASE_URL = rawApiUrl || "/api";

export function resolveHealthUrl(): string {
  if (API_BASE_URL === "/api") {
    return "/health";
  }
  if (API_BASE_URL.endsWith("/api")) {
    return `${API_BASE_URL.slice(0, -4)}/health`;
  }
  return "/health";
}

export function resolveSocketUrl(): string | undefined {
  if (!API_BASE_URL || API_BASE_URL.startsWith("/")) {
    return undefined;
  }
  return API_BASE_URL.replace(/\/api$/, "") || undefined;
}
