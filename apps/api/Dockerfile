FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
RUN npm ci --workspace=apps/api --workspace=packages/types --workspace=packages/db

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=packages/db
RUN npm run build --workspace=apps/api

FROM base AS runner
ENV NODE_ENV=production
# AI Arena stage 4 (browser widget): Chromium runtime. Playwright's own browser downloads are glibc-only
# and do not run on Alpine, so use the distro package and point playwright-core at it.
# Sandbox: the container runs as a non-root user without user namespaces, hence --no-sandbox; the
# network egress of the browser is restricted by the driver (pinned host, https only).
# tini runs as PID 1 and reaps zombie/orphaned browser child processes.
# Residual risk: --no-sandbox weakens renderer isolation. Recommended next hardening: run the browser in a
# dedicated worker container without secrets/DB access and with restricted egress.
RUN apk add --no-cache chromium nss freetype harfbuzz ttf-freefont tini
ENV ARENA_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium
ENV ARENA_BROWSER_NO_SANDBOX=1
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nestjs
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
USER nestjs
EXPOSE 3001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main"]
