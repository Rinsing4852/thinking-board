# syntax=docker/dockerfile:1.7

FROM debian:bookworm-slim AS stockfish-builder
ARG TARGETARCH
ARG STOCKFISH_VERSION=sf_18
ARG STOCKFISH_COMMIT=cb3d4ee9b47d0c5aae855b12379378ea1439675c
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
      build-essential ca-certificates git wget
RUN git clone --depth 1 --branch "${STOCKFISH_VERSION}" \
    https://github.com/official-stockfish/Stockfish.git /stockfish && \
    test "$(git -C /stockfish rev-parse HEAD)" = "${STOCKFISH_COMMIT}"
WORKDIR /stockfish/src
RUN if [ "${TARGETARCH}" = "amd64" ]; then \
      make -j"$(nproc)" profile-build ARCH=x86-64-modern COMP=gcc; \
    elif [ "${TARGETARCH}" = "arm64" ]; then \
      make -j"$(nproc)" profile-build ARCH=armv8 COMP=gcc; \
    else \
      make -j"$(nproc)" profile-build ARCH=general-64 COMP=gcc; \
    fi

FROM node:24-bookworm-slim AS app-builder
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends python3 make g++
WORKDIR /app
COPY package.json package-lock.json tsconfig.json vitest.config.ts ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY apps ./apps
COPY packages ./packages
COPY migrations ./migrations
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8000 \
    DATA_DIR=/app/data \
    DB_PATH=/app/data/trainer.sqlite3 \
    MIGRATIONS_DIR=/app/migrations \
    WEB_DIST_DIR=/app/apps/web/dist \
    STOCKFISH_BINARY=/usr/local/bin/stockfish
WORKDIR /app
COPY --from=stockfish-builder /stockfish/src/stockfish /usr/local/bin/stockfish
COPY --from=stockfish-builder /stockfish/Copying.txt /app/licenses/stockfish/COPYING.txt
COPY --from=app-builder --chown=node:node /app/node_modules ./node_modules
COPY --from=app-builder --chown=node:node /app/dist ./dist
COPY --from=app-builder --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node package.json LICENSE THIRD_PARTY_LICENSES.md ./
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8000/api/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/apps/server/src/index.js"]
