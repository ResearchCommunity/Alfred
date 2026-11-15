# syntax=docker/dockerfile:1

ARG NODE_VERSION=26

# ---- base: Node + Yarn (Corepack is no longer bundled with Node >= 25) ----
FROM node:${NODE_VERSION}-slim AS base
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN npm install --global corepack && corepack enable
COPY package.json yarn.lock .yarnrc.yml ./

# ---- build: all dependencies + compile TypeScript ----
FROM base AS build
RUN --mount=type=cache,target=/root/.yarn/berry/cache yarn install --immutable
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
RUN yarn build

# ---- deps: production dependencies only ----
FROM base AS deps
RUN --mount=type=cache,target=/root/.yarn/berry/cache yarn workspaces focus --production

# ---- runtime: no compiler, no dev deps, no Yarn, non-root ----
FROM node:${NODE_VERSION}-slim AS runtime
WORKDIR /app
# The wheel spin animation draws text; the slim image has no fonts at all
RUN apt-get update \
    && apt-get install --yes --no-install-recommends fontconfig-config fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    HTTP_HOST=0.0.0.0 \
    HTTP_PORT=3050 \
    CONFIG_PATH=/app/config.yaml

# package.json is needed at runtime: "type": "module", and Sapphire locates
# commands/listeners relative to its "main" field.
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY assets ./assets

USER node
EXPOSE 3050

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.HTTP_PORT}/healthz`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "--enable-source-maps", "dist/index.js"]
