import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { isMaintenanceMode } from '@/lib/flags';

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
  '/maintenance',
  // Test probes — handlers self-guard against production
  '/api/test/(.*)',
  '/verify/(.*)',
  '/register/(.*)',
]);

const MAINTENANCE_EXEMPT_ROUTES = new Set([
  '/maintenance',
  '/api/health',
  '/api/inngest',
]);

const MAINTENANCE_EXEMPT_PREFIXES = [
  '/api/webhooks/',
  '/api/test/',
] as const;

function isMaintenanceExemptRoute(pathname: string): boolean {
  if (MAINTENANCE_EXEMPT_ROUTES.has(pathname)) {
    return true;
  }

  return MAINTENANCE_EXEMPT_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
}

function isProgrammaticRoute(pathname: string): boolean {
  return (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/trpc' ||
    pathname.startsWith('/trpc/')
  );
}

export default clerkMiddleware(async (auth, request) => {
  // Maintenance mode stays open only for operational endpoints needed by probes/webhooks.
  const pathname = request.nextUrl.pathname;

  if (!isMaintenanceExemptRoute(pathname)) {
    try {
      const maintenance = await isMaintenanceMode();
      if (maintenance) {
        if (isProgrammaticRoute(pathname)) {
          return NextResponse.json(
            { error: 'maintenance_mode' },
            { status: 503 },
          );
        }

        const maintenanceUrl = new URL('/maintenance', request.url);
        return NextResponse.rewrite(maintenanceUrl);
      }
    } catch {
      // Flag check is best-effort — never block the request on Redis failure
    }
  }

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
