# Multi-stage Dockerfile for EdBase

# --- Base Stage ---
FROM node:22-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# --- Backend Build Stage ---
FROM base AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --include=dev
COPY backend/ ./
RUN npm run build

# --- Frontend Build Stage ---
FROM base AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --include=dev --legacy-peer-deps
COPY frontend/ ./
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# --- Final Production Image ---
FROM base AS production
WORKDIR /app
ENV NODE_ENV=production

# Backend runtime & Prisma 7 migration config
COPY --from=backend-builder /app/backend/dist /app/backend/dist
COPY --from=backend-builder /app/backend/node_modules /app/backend/node_modules
COPY --from=backend-builder /app/backend/package*.json /app/backend/
COPY --from=backend-builder /app/backend/prisma /app/backend/prisma
COPY --from=backend-builder /app/backend/prisma.config.ts /app/backend/prisma.config.ts

# Frontend build (served by Express in production)
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5000) + '/health/live').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["sh", "-c", "cd backend && npx prisma migrate deploy && node dist/server.js"]
