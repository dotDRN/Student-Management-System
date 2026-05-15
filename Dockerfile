# Multi-stage Dockerfile for Sparsha OMS

# --- Base Stage ---
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# --- Backend Build Stage ---
FROM base AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npx prisma generate
RUN npm run build

# --- Frontend Build Stage ---
FROM base AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps
COPY frontend/ ./
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# --- Final Production Image ---
FROM base AS production
WORKDIR /app

# Backend setup
COPY --from=backend-builder /app/backend/dist /app/backend/dist
COPY --from=backend-builder /app/backend/node_modules /app/backend/node_modules
COPY --from=backend-builder /app/backend/package*.json /app/backend/
COPY --from=backend-builder /app/backend/prisma /app/backend/prisma

# Frontend setup
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Install serve for frontend
RUN npm install -g serve

EXPOSE 5000 5173

# We will use docker-compose to override the CMD for different services
CMD ["sh", "-c", "cd backend && npx prisma migrate deploy && node dist/server.js"]
