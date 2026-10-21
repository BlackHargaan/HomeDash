# syntax=docker/dockerfile:1

# ---- Stage 1: build the static bundle ----
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Build the app.
COPY . .
RUN npm run build

# ---- Stage 2: run the HomeDash server (serves the app + /api) ----
# Only the server's runtime dependency (the Anthropic SDK, for the AI
# assistant) is installed; the web app is already bundled into dist/.
FROM node:20-alpine AS runtime
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared

# Port 80 inside the container keeps existing "8080:80" mappings working.
ENV NODE_ENV=production \
    PORT=80 \
    DATA_DIR=/data \
    STATIC_DIR=/app/dist

# Your dashboard is stored here — mount a named volume to keep it across
# container re-creation.
VOLUME ["/data"]

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/api/health >/dev/null 2>&1 || exit 1

CMD ["node", "server/index.js"]
