/**
 * Mutation-kill tests for src/middleware.ts
 * Covers: maintenance mode logic, Sentry user context, missing public route patterns.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const shared = vi.hoisted(() => {
  const isMaintenanceMock = vi.fn();
  const sentrySetUser = vi.fn();
  const nextResponseRewrite = vi.fn((_url: unknown) => ({ type: 'rewrite' as const }));
  const nextResponseJson = vi.fn((body: unknown, init?: { status?: number }) => ({
    type: 'json' as const,
    body,
    status: init?.status ?? 200,
  }));

  return {
    middlewareCallback: null as ((auth: any, request: any) => Promise<any>) | null,
    isMaintenanceMock,
    sentrySetUser,
    nextResponseRewrite,
    nextResponseJson,
  };
});

vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: (cb: any) => {
    shared.middlewareCallback = cb;
    return cb;
  },
  createRouteMatcher: (patterns: string[]) => {
    return (request: { url: string; nextUrl?: { pathname: string } }) => {
      const pathname =
        request.nextUrl?.pathname ?? new URL(request.url).pathname;
      return patterns.some((pattern) => {
        if (!pattern.includes('(')) return pathname === pattern;
        const regexStr = '^' + pattern.replace(/\(\.?\*\)/g, '.*') + '$';
        return new RegExp(regexStr).test(pathname);
      });
    };
  },
}));

vi.mock('@/lib/flags', () => ({
  isMaintenanceMode: (...args: any[]) => shared.isMaintenanceMock(...args),
}));

vi.mock('@sentry/nextjs', () => ({
  setUser: (arg: unknown) => shared.sentrySetUser(arg),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    rewrite: (url: unknown) => shared.nextResponseRewrite(url),
    json: (body: unknown, init?: { status?: number }) => shared.nextResponseJson(body, init),
  },
}));

import { config } from './middleware';

function makeRequest(pathname: string) {
  return {
    url: `http://localhost:4000${pathname}`,
    nextUrl: { pathname },
  };
}

function makeAuth(userId?: string) {
  return {
    protect: vi.fn(async () => {}),
    userId,
  };
}

// ─── Maintenance mode ───────────────────────────────────────────────────────

describe('middleware — maintenance mode exemptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shared.isMaintenanceMock.mockResolvedValue(false);
  });

  it('/maintenance path is exempt — isMaintenanceMode is NOT checked', async () => {
    await shared.middlewareCallback!(makeAuth(), makeRequest('/maintenance'));
    expect(shared.isMaintenanceMock).not.toHaveBeenCalled();
  });

  it('/api/health is exempt because it starts with /api/ — isMaintenanceMode NOT checked', async () => {
    await shared.middlewareCallback!(makeAuth(), makeRequest('/api/health'));
    expect(shared.isMaintenanceMock).not.toHaveBeenCalled();
  });

  it('/api/inngest is exempt — isMaintenanceMode NOT checked', async () => {
    await shared.middlewareCallback!(makeAuth(), makeRequest('/api/inngest'));
    expect(shared.isMaintenanceMock).not.toHaveBeenCalled();
  });

  it('/api/webhooks/email is exempt — isMaintenanceMode NOT checked', async () => {
    await shared.middlewareCallback!(makeAuth(), makeRequest('/api/webhooks/email'));
    expect(shared.isMaintenanceMock).not.toHaveBeenCalled();
  });

  it('/api/test/reset-db is exempt — isMaintenanceMode NOT checked', async () => {
    await shared.middlewareCallback!(makeAuth(), makeRequest('/api/test/reset-db'));
    expect(shared.isMaintenanceMock).not.toHaveBeenCalled();
  });

  it('non-exempt path /dashboard — isMaintenanceMode IS checked', async () => {
    await shared.middlewareCallback!(makeAuth(), makeRequest('/dashboard'));
    expect(shared.isMaintenanceMock).toHaveBeenCalledOnce();
  });

  it('non-exempt path /events — isMaintenanceMode IS checked', async () => {
    await shared.middlewareCallback!(makeAuth(), makeRequest('/events'));
    expect(shared.isMaintenanceMock).toHaveBeenCalledOnce();
  });

  it('protected API routes are checked instead of bypassing maintenance', async () => {
    await shared.middlewareCallback!(
      makeAuth(),
      makeRequest('/api/events/550e8400-e29b-41d4-a716-446655440000/sessions'),
    );
    expect(shared.isMaintenanceMock).toHaveBeenCalledOnce();
  });
});

describe('middleware — maintenance mode active / inactive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shared.isMaintenanceMock.mockResolvedValue(false);
  });

  it('rewrites to /maintenance URL when maintenance mode is active', async () => {
    shared.isMaintenanceMock.mockResolvedValue(true);
    const result = await shared.middlewareCallback!(makeAuth(), makeRequest('/dashboard'));
    expect(shared.nextResponseRewrite).toHaveBeenCalledOnce();
    expect(shared.nextResponseRewrite).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/maintenance' }),
    );
    expect(result).toEqual({ type: 'rewrite' });
  });

  it('does NOT rewrite when maintenance mode is inactive', async () => {
    shared.isMaintenanceMock.mockResolvedValue(false);
    await shared.middlewareCallback!(makeAuth(), makeRequest('/dashboard'));
    expect(shared.nextResponseRewrite).not.toHaveBeenCalled();
  });

  it('returns 503 JSON for protected API routes when maintenance mode is active', async () => {
    shared.isMaintenanceMock.mockResolvedValue(true);
    const result = await shared.middlewareCallback!(
      makeAuth(),
      makeRequest('/api/events/550e8400-e29b-41d4-a716-446655440000/sessions'),
    );

    expect(shared.nextResponseJson).toHaveBeenCalledOnce();
    expect(shared.nextResponseJson).toHaveBeenCalledWith(
      { error: 'maintenance_mode' },
      { status: 503 },
    );
    expect(shared.nextResponseRewrite).not.toHaveBeenCalled();
    expect(result).toEqual({
      type: 'json',
      body: { error: 'maintenance_mode' },
      status: 503,
    });
  });

  it('swallows isMaintenanceMode errors — request proceeds normally', async () => {
    shared.isMaintenanceMock.mockRejectedValue(new Error('Redis timeout'));
    await expect(
      shared.middlewareCallback!(makeAuth(), makeRequest('/dashboard')),
    ).resolves.not.toThrow();
    expect(shared.nextResponseRewrite).not.toHaveBeenCalled();
  });
});

// ─── Sentry user context ────────────────────────────────────────────────────

describe('middleware — Sentry user context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shared.isMaintenanceMock.mockResolvedValue(false);
  });

  it('calls Sentry.setUser({ id: userId }) when userId is present (auth as plain object)', async () => {
    const auth = makeAuth('user_clerk_123');
    await shared.middlewareCallback!(auth, makeRequest('/'));
    expect(shared.sentrySetUser).toHaveBeenCalledWith({ id: 'user_clerk_123' });
  });

  it('calls Sentry.setUser(null) when userId is absent', async () => {
    const auth = makeAuth(); // no userId → undefined
    await shared.middlewareCallback!(auth, makeRequest('/'));
    expect(shared.sentrySetUser).toHaveBeenCalledWith(null);
  });

  it('calls auth() when auth is a function to resolve the authState', async () => {
    const authFn = Object.assign(
      vi.fn(async () => ({ userId: 'user_fn_xyz' })),
      { protect: vi.fn() },
    );
    await shared.middlewareCallback!(authFn, makeRequest('/'));
    expect(authFn).toHaveBeenCalled();
    expect(shared.sentrySetUser).toHaveBeenCalledWith({ id: 'user_fn_xyz' });
  });

  it('calls Sentry.setUser(null) when auth function returns no userId', async () => {
    const authFn = Object.assign(
      vi.fn(async () => ({ userId: null })),
      { protect: vi.fn() },
    );
    await shared.middlewareCallback!(authFn, makeRequest('/'));
    expect(shared.sentrySetUser).toHaveBeenCalledWith(null);
  });

  it('handles null authState via optional chaining — does not throw, calls setUser(null)', async () => {
    const authFn = Object.assign(
      vi.fn(async () => null),
      { protect: vi.fn() },
    );
    await shared.middlewareCallback!(authFn, makeRequest('/'));
    expect(shared.sentrySetUser).toHaveBeenCalledWith(null);
  });

  it('swallows Sentry errors — request is never blocked', async () => {
    shared.sentrySetUser.mockImplementation(() => {
      throw new Error('Sentry unavailable');
    });
    await expect(
      shared.middlewareCallback!(makeAuth('user_abc'), makeRequest('/')),
    ).resolves.not.toThrow();
  });
});

// ─── Missing public route patterns ─────────────────────────────────────────

describe('middleware — missing public route pattern coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shared.isMaintenanceMock.mockResolvedValue(false);
  });

  it('skips auth.protect() for /maintenance (public page in route list)', async () => {
    const auth = makeAuth();
    await shared.middlewareCallback!(auth, makeRequest('/maintenance'));
    expect(auth.protect).not.toHaveBeenCalled();
  });

  it('skips auth.protect() for /api/test/reset-db (test probe routes)', async () => {
    const auth = makeAuth();
    await shared.middlewareCallback!(auth, makeRequest('/api/test/reset-db'));
    expect(auth.protect).not.toHaveBeenCalled();
  });

  it('skips auth.protect() for /verify/token123 (verify sub-path pattern)', async () => {
    const auth = makeAuth();
    await shared.middlewareCallback!(auth, makeRequest('/verify/token123'));
    expect(auth.protect).not.toHaveBeenCalled();
  });

  it('skips auth.protect() for /register/annual-conf-2026 (registration sub-path)', async () => {
    const auth = makeAuth();
    await shared.middlewareCallback!(auth, makeRequest('/register/annual-conf-2026'));
    expect(auth.protect).not.toHaveBeenCalled();
  });

  it('config.matcher[0] is the non-static-asset pattern (not an empty string)', () => {
    expect(config.matcher[0]).toMatch(/_next/);
    expect(config.matcher[0].length).toBeGreaterThan(20);
  });
});
