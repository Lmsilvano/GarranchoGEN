# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
# Needed for some native addons on musl libc (sharp, later phases)
RUN apk add --no-cache libc6-compat
# Ativa o shim do Yarn pinado em package.json#packageManager
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json yarn.lock ./
COPY scripts/assert-yarn.mjs ./scripts/assert-yarn.mjs
RUN yarn install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

# DATA_DIR — named volume inherits this ownership on first mount
RUN mkdir -p /data && chown nextjs:nodejs /data

USER nextjs

ENV PORT=3000
ENV DATA_DIR=/data
# Standalone server.js binds to the resolved hostname by default, which
# inside a container is its own IP — not loopback. Without this, health-
# checks/port-forwards against 127.0.0.1 get connection refused.
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "server.js"]
