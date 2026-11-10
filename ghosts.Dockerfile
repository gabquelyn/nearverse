# Ghost traders only, for an always-on host such as Railway, Render or Fly.io. The website stays where it is.
# Build: docker build -f ghosts.Dockerfile -t nearverse-ghosts .
# Mount a volume at /data so the traders keep the same wallets across restarts.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEARVERSE_GHOST_KEY_FILE=/data/ghost-keys.json \
    NEARVERSE_GHOST_STATUS_FILE=/data/ghost-status.json
COPY package.json package-lock.json tsconfig.json ./
COPY packages/economy/package.json packages/economy/package.json
COPY web/package.json web/package.json
RUN npm ci --no-audit --no-fund --include=dev --ignore-scripts
COPY config config
COPY packages/economy packages/economy
COPY scripts scripts
RUN mkdir -p /data
CMD ["npx", "tsx", "scripts/ghost-traders.ts"]
