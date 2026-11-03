# One toolchain for everything. See README "Run it". No local Rust or Node is needed.
FROM node:22-bookworm-slim AS node

# ---------- Rust, the wasm target and Node ----------
FROM rust:1.98.1-slim-bookworm AS toolchain
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && rustup target add wasm32-unknown-unknown
WORKDIR /app

# ---------- Locked dependencies and source ----------
FROM toolchain AS source
COPY package.json package-lock.json ./
COPY packages/economy/package.json packages/economy/package.json
COPY web/package.json web/package.json
RUN npm ci --no-audit --no-fund
COPY . .

# ---------- Tests, contract build and deploy commands ----------
FROM source AS ops
RUN cargo test --locked --no-run --manifest-path contracts/nearverse/Cargo.toml \
 && npm run build:contract

# ---------- `docker build --target contract-wasm --output out .` writes the binary to ./out ----------
FROM scratch AS contract-wasm
COPY --from=ops /app/out/nearverse.wasm /nearverse.wasm

# ---------- Web build ----------
FROM source AS web-build
RUN npm run build

# ---------- Web runtime: small, non-root, configured only by environment variables ----------
FROM node AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=web-build /app/web/.next/standalone ./
COPY --from=web-build /app/web/.next/static ./web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "web/server.js"]
