/**
 * Tests for Clerk middleware route protection (Req 6A-4).
 *
 * Strategy: We mock @clerk/nextjs/server to capture what the middleware does
 * for each route — specifically whether auth.protect() is called (private)
 * or skipped (public).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared state for mock capture — must be declared with vi.hoisted()
// so they exist when the mock factory runs (vi.mock is hoisted)
const shared = vi.hoisted(() => ({
  middlewareCallback: null as ((auth: any, request: any) => Promise<void>) | null,
  routePatterns: [] as string[],
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: (cb: any) => {
    shared.middlewareCallback = cb;
    return cb;
  },
  createRouteMatcher: (patterns: string[]) => {
    shared.routePatterns = patterns;
    return (request: { url: string; nextUrl?: { pathname: string } }) => {
      const pathname =
        request.nextUrl?.pathname ?? new URL(request.url).pathname;
      return patterns.some((pattern) => {
        const regexStr = '^' + pattern.replace(/\(\.?\*\)/g, '.*') + '$';
        return new RegExp(regexStr).test(pathname);
      });
    };
  },
}));

// Import AFTER mocking so the mock is in place
import middleware, { config } from './middleware';

function makeRequest(pathname: string) {
  const url = `http://localhost:3000${pathname}`;
  return { url, nextUrl: { pathname } };
}

function makeAuth() {
  return {
    protect: vi.fn(async () => {}),
  };
}

describe('Clerk middleware (6A-4)', () => {
  it('calls auth.protect() for protected routes like /events', async () => {
    const auth = makeAuth();
    await shared.middlewareCallback!(auth, makeRequest('/events'));
    expect(auth.protect).toHaveBeenCalled();
  });

  it('skips auth.protect() for public event page /e/test-event', async () => {
    const auth = makeAuth();
    await shared.middlewareCallback!(auth, makeRequest('/e/test-event'));
    expect(auth.protect).not.toHaveBeenCalled();
  });

  it('skips auth.protect() for webhook routes /api/webhooks/email', async () => {
    const auth = makeAuth();
    await shared.middlewareCallback!(auth, makeRequest('/api/webhooks/email'));
    expect(auth.protect).not.toHaveBeenCalled();
  });

  it('skips auth.protect() for the homepage /', async () => {
    const auth = makeAuth();
    await shared.middlewareCallback!(auth, makeRequest('/'));
    expect(auth.protect).not.toHaveBeenCalled();
  });

  it('skips auth.protect() for /login, /forgot-password, /reset-password, /verify', async () => {
    for (const path of ['/login', '/forgot-password', '/reset-password', '/verify/abc123']) {
      const auth = makeAuth();
      await shared.middlewareCallback!(auth, makeRequest(path));
      expect(auth.protect).not.toHaveBeenCalled();
    }
  });

  it('calls auth.protect() for dashboard routes /people, /program, /travel', async () => {
    for (const path of ['/people', '/program', '/travel']) {
      const auth = makeAuth();
      await shared.middlewareCallback!(auth, makeRequest(path));
      expect(auth.protect).toHaveBeenCalled();
    }
  });

  it('registers all required public route patterns', () => {
    expect(shared.routePatterns).toContain('/');
    expect(shared.routePatterns).toContain('/login(.*)');
    expect(shared.routePatterns).toContain('/forgot-password(.*)');
    expect(shared.routePatterns).toContain('/reset-password(.*)');
    expect(shared.routePatterns).toContain('/e/(.*)');
    expect(shared.routePatterns).toContain('/verify/(.*)');
    expect(shared.routePatterns).toContain('/api/webhooks/(.*)');
    expect(shared.routePatterns).toContain('/api/health');
  });

  it('exports matcher config covering general and API routes', () => {
    expect(config.matcher).toBeDefined();
    expect(config.matcher.length).toBe(2);
    expect(config.matcher[1]).toContain('api');
  });
});
