# Single image: NestJS API + built React frontend, served together on one port.

FROM node:22-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-slim AS backend
# # bcrypt falls back to compiling from source when its prebuilt binary can't be downloaded.
# RUN apt-get update \
#   && apt-get install -y --no-install-recommends python3 make g++ \
#   && rm -rf /var/lib/apt/lists/*
WORKDIR /build/backend
COPY backend/package*.json ./
RUN npm ci
# Make BuildKit finish the frontend build before starting the memory-intensive backend build.
COPY --from=frontend /build/frontend/dist /build/frontend-dist

COPY backend/ ./
# 1536 MB, not 2048: on a 2 GB Docker VM a 2 GB heap lets V8 skip collection until the
# cgroup runs out and the OOM killer takes the build down with exit code 137.
RUN NODE_OPTIONS=--max-old-space-size=1536 npm run build && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production \
    PORT=3000 \
    STATIC_DIR=/app/public
WORKDIR /app
COPY --from=backend /build/backend/package.json ./
COPY --from=backend /build/backend/node_modules ./node_modules
COPY --from=backend /build/backend/dist ./dist
COPY backend/scripts ./scripts
COPY --from=frontend /build/frontend/dist ./public
RUN mkdir -p uploads backups && chown -R node:node uploads backups
USER node
EXPOSE 3000
CMD ["node", "dist/main"]
