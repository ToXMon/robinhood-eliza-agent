# ─── Stage 1: Build (install deps + compile TypeScript) ─────────────────
FROM node:20-slim AS build

WORKDIR /app

# Install deps first (cacheable layer). --ignore-scripts avoids running
# postinstall scripts that may need native toolchain or network at install time.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Compile TypeScript to dist/
COPY tsconfig.json ./
COPY src/ ./src/
COPY characters/ ./characters/
RUN npm run build

# ─── Stage 2: Runtime (slim) ────────────────────────────────────────────
FROM node:20-slim AS runtime

WORKDIR /app

# Production artifacts only. node_modules carried from build stage.
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY characters/ ./characters/
COPY data/ ./data/

# Health endpoint — src/index.ts runs a bulletproof keep-alive HTTP server
# on this port. Akash probes /health to confirm liveness.
EXPOSE 8080

# Container must NOT exit. index.ts has infinite-retry + keep-alive hold;
# health server stays up even if the agent loop fails.
CMD ["node", "dist/index.js"]
