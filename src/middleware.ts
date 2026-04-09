import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';

const isPublicRoute = createRouteMatcher([
  '/',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/e/(.*)',
  '/verify',
  '/api/webhooks/(.*)',
  '/api/inngest',
  '/api/health',
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }

  // Set Clerk user context on Sentry (userId only — no PII)
  try {
    const authState = typeof auth === 'function' ? await auth() : auth;
    const userId = authState?.userId;
    if (userId) {
      Sentry.setUser({ id: userId });
    } else {
      Sentry.setUser(null);
    }
  } catch {
    // Sentry context is best-effort — never block the request
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
