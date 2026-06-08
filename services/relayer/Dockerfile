# kumo-good relayer — portable container for Railway / Render / Fly.
#
# IMPORTANT: build from the REPOSITORY ROOT so the pnpm workspace (packages/shared)
# is in the build context:
#
#   docker build -f services/relayer/Dockerfile -t kumo-relayer .
#
# On Railway/Render/Fly: set the Dockerfile path to services/relayer/Dockerfile
# and the build context / root directory to the repo root (the default).
#
# The relayer runs TypeScript directly via tsx — @kumo-good/shared is consumed as
# source (main: ./src/index.ts), so there is no compile step.

FROM node:22-slim AS base
WORKDIR /app
# pnpm via corepack, pinned by the root package.json "packageManager" field.
RUN corepack enable

# 1) Workspace manifests first — keeps `pnpm install` in a cached layer.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/relayer/package.json ./services/relayer/

# 2) Install the relayer and its workspace deps only (tsx is a devDep, so no --prod).
RUN pnpm install --frozen-lockfile --filter relayer...

# 3) Source. shared is TS, consumed directly by tsx — no build step.
COPY packages/shared ./packages/shared
COPY services/relayer ./services/relayer

ENV NODE_ENV=production
# Hosts inject PORT; the server reads config.port (default 8787) and binds 0.0.0.0.
EXPOSE 8787
CMD ["pnpm", "--filter", "relayer", "start"]
