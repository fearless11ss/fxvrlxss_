# syntax=docker/dockerfile:1.7

FROM node:24.17.0-bookworm-slim AS builder

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/bot/package.json apps/bot/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY apps/ops-cli/package.json apps/ops-cli/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/domain/package.json packages/domain/package.json

RUN npm ci

COPY . .
RUN npm run build

FROM builder AS production-dependencies
RUN npm prune --omit=dev

FROM node:24.17.0-bookworm-slim AS bot

ENV NODE_ENV=production
WORKDIR /app

COPY --from=production-dependencies --chown=node:node /workspace/node_modules ./node_modules
COPY --from=builder --chown=node:node /workspace/apps/bot/dist ./apps/bot/dist
COPY --from=builder --chown=node:node /workspace/apps/bot/package.json ./apps/bot/package.json
COPY --from=builder --chown=node:node /workspace/packages/domain/dist ./packages/domain/dist
COPY --from=builder --chown=node:node /workspace/packages/domain/package.json ./packages/domain/package.json
COPY --from=builder --chown=node:node /workspace/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=node:node /workspace/packages/database/migrations ./packages/database/migrations
COPY --from=builder --chown=node:node /workspace/packages/database/package.json ./packages/database/package.json

USER node
CMD ["node", "apps/bot/dist/index.js"]

FROM node:24.17.0-bookworm-slim AS dashboard

ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
WORKDIR /app

COPY --from=builder --chown=node:node /workspace/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=node:node /workspace/apps/dashboard/.next/static ./apps/dashboard/.next/static

USER node
CMD ["node", "apps/dashboard/server.js"]
