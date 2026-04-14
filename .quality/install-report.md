# QA Harness — Install Report

Generated: 2026-04-14T15:01:06.975Z

## Detected Services

- **clerk** (validated): matched 2 package pattern(s), 2 env pattern(s)
- **drizzle-postgres** (validated): matched 3 package pattern(s), 1 env pattern(s)
- **prisma-postgres** (draft): matched 0 package pattern(s), 1 env pattern(s)
- **resend** (draft): matched 1 package pattern(s), 1 env pattern(s)
- **sentry** (draft): matched 1 package pattern(s), 2 env pattern(s)
- **upstash** (draft): matched 1 package pattern(s), 1 env pattern(s)

## Unknown Signals

- package: `@aws-sdk/client-s3` → suggests `aws-sdk`
- package: `@aws-sdk/lib-storage` → suggests `aws-sdk`
- package: `@aws-sdk/s3-request-presigner` → suggests `aws-sdk`
- package: `@axe-core/playwright` → suggests `axe-core`
- package: `@dnd-kit/core` → suggests `dnd-kit`
- package: `@dnd-kit/sortable` → suggests `dnd-kit`
- package: `@dnd-kit/utilities` → suggests `dnd-kit`
- package: `@hookform/resolvers` → suggests `hookform`
- package: `@pdfme/common` → suggests `pdfme`
- package: `@pdfme/generator` → suggests `pdfme`
- package: `@pdfme/schemas` → suggests `pdfme`
- package: `@pdfme/ui` → suggests `pdfme`
- package: `@playwright/test` → suggests `playwright`
- package: `@radix-ui/react-avatar` → suggests `radix-ui`
- package: `@radix-ui/react-dropdown-menu` → suggests `radix-ui`
- package: `@radix-ui/react-label` → suggests `radix-ui`
- package: `@radix-ui/react-select` → suggests `radix-ui`
- package: `@radix-ui/react-separator` → suggests `radix-ui`
- package: `@radix-ui/react-slot` → suggests `radix-ui`
- package: `@radix-ui/react-switch` → suggests `radix-ui`
- package: `@radix-ui/react-tabs` → suggests `radix-ui`
- package: `@radix-ui/react-toast` → suggests `radix-ui`
- package: `@radix-ui/react-tooltip` → suggests `radix-ui`
- package: `@stryker-mutator/core` → suggests `stryker-mutator`
- package: `@stryker-mutator/vitest-runner` → suggests `stryker-mutator`
- package: `@tailwindcss/postcss` → suggests `tailwindcss`
- package: `@types/archiver` → suggests `types`
- package: `@types/js-yaml` → suggests `types`
- package: `@types/node` → suggests `types`
- package: `@types/papaparse` → suggests `types`
- package: `@types/react` → suggests `types`
- package: `@types/react-dom` → suggests `types`
- package: `@vitejs/plugin-react` → suggests `vitejs`
- package: `@yudiel/react-qr-scanner` → suggests `yudiel`
- package: `class-variance-authority` → suggests `class-variance-authority`
- env: `INNGEST_EVENT_KEY`
- env: `INNGEST_SIGNING_KEY`
- env: `EVOLUTION_API_BASE_URL`
- env: `EVOLUTION_API_KEY`
- env: `EVOLUTION_INSTANCE_NAME`
- env: `EVOLUTION_WEBHOOK_SECRET`
- env: `NEXT_PUBLIC_APP_URL`
- env: `NEXT_PUBLIC_APP_NAME`

## Env Variables Added to `.env.test.example`

- CLERK_SECRET_KEY
- NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
- E2E_CLERK_ADMIN_USERNAME
- E2E_CLERK_ADMIN_PASSWORD
- CLERK_TESTING_TOKEN
- DATABASE_URL_TEST
- TEST_DATABASE_SEED_STRATEGY
- DIRECT_URL_TEST
- RESEND_API_KEY_TEST
- SENTRY_DSN_TEST
- SENTRY_AUTH_TOKEN
- UPSTASH_REDIS_REST_URL_TEST
- UPSTASH_REDIS_REST_TOKEN_TEST
- UPSTASH_KAFKA_REST_URL
- UPSTASH_KAFKA_REST_USERNAME
- UPSTASH_KAFKA_REST_PASSWORD

## Dev Packages Installed

**Installed:**
- @clerk/testing
- msw

## Stub Manifests

_None._

## Next Steps

1. Fill in `.env.test` (copy from `.env.test.example`).
2. Review `.quality/policies/tiers.yaml` and adjust globs for your project.
3. Author contracts: `/playbook:contract-pack <feature-name>` for each critical feature.
4. Run `npx qa baseline` to populate module mutation baselines.
5. Run `npx qa run` for the first QA session.
