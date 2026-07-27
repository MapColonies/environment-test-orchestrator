# syntax=docker/dockerfile:1.7

# ---------- Build stage ----------
FROM oven/bun:1 AS build
WORKDIR /app

# Nitro output preset — the OpenShift image is a plain Node server, not a
# Cloudflare Worker.
ENV NITRO_PRESET=node-server
ENV NODE_ENV=production

COPY package.json bun.lockb* bunfig.toml* ./
RUN bun install --frozen-lockfile || bun install

COPY . .
RUN bun run build

# ---------- Runtime stage ----------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
ENV REPORTS_DIR=/data/reports

# Copy the Nitro node-server bundle.
COPY --from=build /app/.output ./.output

# Non-root user (any UID works on OpenShift's random-UID SCC).
RUN mkdir -p /data/reports && chgrp -R 0 /data && chmod -R g=u /data
VOLUME ["/data"]

EXPOSE 8080
USER 1001

CMD ["node", ".output/server/index.mjs"]
