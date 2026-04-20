# syntax=docker/dockerfile:1

# --- deps stage: install production-capable dependencies ---
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# --- builder stage: build the Next.js app in standalone mode ---
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so
# production deployments MUST override this ARG via `--build-arg` with the
# real Clerk publishable key for the target environment. The default is a
# shape-valid placeholder that only exists so the build doesn't fail on
# static pages that render the Clerk provider.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}

ENV NEXT_TELEMETRY_DISABLED=1
# Placeholder so module-load-time initializers (neon(), Clerk server) don't
# throw during `next build` page-data collection. Real values injected at
# runtime via the container's env.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV CLERK_SECRET_KEY="sk_test_build_placeholder_not_used_at_runtime"
RUN npm run build

# --- runner stage: minimal image with only what's needed at runtime ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# Inline HOSTNAME=0.0.0.0 so it overrides whatever the container platform
# injects (AWS App Runner, for example, sets HOSTNAME to the instance's
# internal FQDN, which Next.js standalone would then bind to and fail
# health checks on). `exec` replaces the shell so SIGTERM reaches node.
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node server.js"]
