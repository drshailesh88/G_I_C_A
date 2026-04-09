import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // Strict mode for catching bugs early
  reactStrictMode: true,
};

export default withSentryConfig(nextConfig, {
  // Sentry organization and project slugs
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Auth token for source map uploads (CI only)
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload a larger set of source maps for prettier stack traces
  widenClientFileUpload: true,

  // Silently skip source map upload when auth token is missing (local dev)
  silent: !process.env.SENTRY_AUTH_TOKEN,
});
