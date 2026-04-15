import * as Sentry from '@sentry/nextjs';
import { isTestMode, sentryBeforeSendHook } from '@/lib/sentry/test-transport';

const testMode = isTestMode();

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'development',

  // Performance monitoring: 100% in dev, 10% in production
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,

  // Disable Sentry entirely if no DSN is configured
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  ...(testMode ? { beforeSend: sentryBeforeSendHook } : {}),
});
