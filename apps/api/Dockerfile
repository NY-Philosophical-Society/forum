# Multi-stage: the runtime image carries no source, no dev dependencies, and
# no build toolchain — only compiled JS, production deps, and the generated
# Prisma client.
#
# Build context is the REPO ROOT, not apps/api, because this is an npm
# workspaces monorepo: the API imports @nyps-forum/shared, and the lockfile
# lives at the root.
#   docker build -f apps/api/Dockerfile .

FROM node:22-slim AS base
# Prisma needs OpenSSL; it is not in the slim image.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- deps: install once against the lockfile, cached unless manifests change
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci

# ---- build: compile shared + api, generate the Prisma client
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run build --workspace=packages/shared --if-present
RUN npm run build --workspace=apps/api

# ---- runtime
FROM base AS runtime
ENV NODE_ENV=production
# Never run as root.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nodejs

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma

USER nodejs
EXPOSE 4000
# Hosts set PORT; src/index.ts already reads it.
ENV PORT=4000

# Migrations run on boot so a deploy can never serve against an out-of-date
# schema. `migrate deploy` only applies committed migrations — it never
# generates or resets, so it is safe to run unattended in production.
CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/index.js"]
