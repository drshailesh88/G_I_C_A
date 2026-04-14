// FROZEN CONTRACT — DO NOT EDIT
// Approved by: Shailesh Singh on 2026-04-14
// Source: e2e/contracts/eventid-scoping/examples.md + counterexamples.md
// Version: v2 (2026-04-14) — schema alignment: Clerk role + event_user_assignments.
//
// These tests run against the LIVE APPLICATION in a real browser.
// No mocks. No jsdom.
//
// Red-phase expectation: tests should FAIL until the implementation + test
// fixtures are in place. Passing before the feature is built means the test
// is too shallow.
//
// Seed-data requirements (needed for these tests to go green):
//   Users (v2 schema: Clerk global role + event_user_assignments rows):
//     coord_A        — Clerk org:event_coordinator + assignment on A
//     coord_B        — Clerk org:event_coordinator + assignment on B
//     coord_AB       — Clerk org:event_coordinator + assignments on A and B
//     super          — Clerk org:super_admin (no assignment rows required)
//     readonly_A     — Clerk org:read_only + assignment on A
//   Events:
//     EVENT_A_ID, EVENT_B_ID — two distinct events, each populated with
//                              delegates, travel, accommodation, sessions
//   Test-only endpoint:
//     GET /api/test/state?entity=<table>&eventId=<id>
//       returns the current rows for that entity under that event; used to
//       make deep assertions without reading source code.
//
// Credentials and IDs come from .env.test.local. Placeholders below will
// throw when the env isn't set — that's intentional.

import { test, expect, Page } from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';

// ── Environment guards ──────────────────────────────────────────────────────
const env = (key: string): string => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var ${key} (set in .env.test.local)`);
  return v;
};

// ── Setup (token fetch + sign-in helpers) ───────────────────────────────────
test.beforeAll(async () => {
  await clerkSetup();
});

async function signInAs(page: Page, username: string, password: string) {
  await page.goto('/login');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'password', identifier: username, password },
  });
}

// Test-only state probe. Returns JSON rows for the given entity+event.
async function probeState(
  page: Page,
  entity: string,
  eventId: string,
): Promise<Array<Record<string, unknown>>> {
  const res = await page.request.get(
    `/api/test/state?entity=${entity}&eventId=${eventId}`,
  );
  expect(res.status(), 'test state probe must be 200').toBe(200);
  return (await res.json()) as Array<Record<string, unknown>>;
}

test.describe('eventid-scoping — Happy paths', () => {
  test('Example 1: Coordinator sees only their event', async ({ page }) => {
    const A = env('EVENT_A_ID');
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    await page.goto(`/events/${A}/people`);

    // Assertion 1: UI shows delegates for A
    await expect(page.getByRole('heading', { name: /people/i })).toBeVisible();

    // Assertion 2 (deep): every row returned by state probe has eventId=A
    const rows = await probeState(page, 'delegates', A);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.eventId).toBe(A);

    // Assertion 3: persistence — reload keeps the same view
    await page.reload();
    await expect(page.getByRole('heading', { name: /people/i })).toBeVisible();
  });

  test('Example 2: Super Admin reaches any event without membership', async ({ page }) => {
    const B = env('EVENT_B_ID');
    await signInAs(page, env('E2E_SUPER_USERNAME'), env('E2E_SUPER_PASSWORD'));
    await page.goto(`/events/${B}/people`);
    await expect(page.getByRole('heading', { name: /people/i })).toBeVisible();
    const rows = await probeState(page, 'delegates', B);
    for (const row of rows) expect(row.eventId).toBe(B);
  });

  test('Example 4: Read-only sees data but mutation buttons disabled', async ({ page }) => {
    const A = env('EVENT_A_ID');
    await signInAs(page, env('E2E_READONLY_A_USERNAME'), env('E2E_READONLY_A_PASSWORD'));
    await page.goto(`/events/${A}/accommodation`);
    // Mutation buttons rendered but disabled (not hidden, per RBAC rules in CLAUDE.md)
    const addButton = page.getByRole('button', { name: /add/i });
    await expect(addButton).toBeVisible();
    await expect(addButton).toBeDisabled();
  });

  test('Example 5: Public registration accepts URL eventId without auth', async ({ page }) => {
    const A = env('EVENT_A_ID');
    await page.goto(`/register/${A}`);
    await expect(page.getByRole('heading', { name: /register/i })).toBeVisible();
    // Form posts succeed without auth
    // (detailed registration flow is a separate contract pack)
  });

  test('Example 7: Server action derives eventId from URL, ignores body', async ({ page, request }) => {
    const A = env('EVENT_A_ID');
    const B = env('EVENT_B_ID');
    await signInAs(page, env('E2E_COORD_AB_USERNAME'), env('E2E_COORD_AB_PASSWORD'));

    // Navigate to A's session-new page, then POST with body containing eventId=B
    const res = await request.post(`/api/events/${A}/sessions`, {
      data: {
        eventId: B, // smuggling attempt
        title: 'Test session',
        startsAt: '2026-05-01T10:00:00Z',
        endsAt: '2026-05-01T11:00:00Z',
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'eventId mismatch' });

    // Assert no row was inserted in either event
    const aRows = await probeState(page, 'sessions', A);
    const bRows = await probeState(page, 'sessions', B);
    expect(aRows.find((r) => r.title === 'Test session')).toBeUndefined();
    expect(bRows.find((r) => r.title === 'Test session')).toBeUndefined();
  });
});

test.describe('eventid-scoping — Counterexamples (must NEVER happen)', () => {
  test('CE1: Cross-event GET returns 404', async ({ page, request }) => {
    const B = env('EVENT_B_ID');
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    const res = await request.get(`/events/${B}/people`);
    expect(res.status()).toBe(404);
  });

  test('CE2: Cross-event POST returns 404 and does not insert', async ({ page, request }) => {
    const B = env('EVENT_B_ID');
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    const res = await request.post(`/api/events/${B}/sessions`, {
      data: { title: 'Malicious', startsAt: '2026-05-01T10:00:00Z', endsAt: '2026-05-01T11:00:00Z' },
    });
    expect(res.status()).toBe(404);
    const rows = await probeState(page, 'sessions', B);
    expect(rows.find((r) => r.title === 'Malicious')).toBeUndefined();
  });

  test('CE3: Body eventId mismatch rejected with 400 + Sentry event', async ({ page, request }) => {
    const A = env('EVENT_A_ID');
    const B = env('EVENT_B_ID');
    await signInAs(page, env('E2E_COORD_AB_USERNAME'), env('E2E_COORD_AB_PASSWORD'));
    const res = await request.post(`/api/events/${A}/sessions`, {
      data: { eventId: B, title: 'X', startsAt: '2026-05-01T10:00:00Z', endsAt: '2026-05-01T11:00:00Z' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'eventId mismatch' });
    // Sentry event assertion: probe a test-only endpoint that exposes recently captured events
    const sentry = await request.get(
      `/api/test/sentry-events?endpoint=/api/events/${A}/sessions&kind=eventId-mismatch`,
    );
    expect(sentry.status()).toBe(200);
    const events = await sentry.json();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toMatchObject({ urlEventId: A, bodyEventId: B });
  });

  test('CE4: 404 body leaks no eventId, no "access"/"permission"/"forbidden"', async ({ page, request }) => {
    const B = env('EVENT_B_ID');
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    const res = await request.get(`/events/${B}/people`);
    expect(res.status()).toBe(404);
    const text = await res.text();
    expect(text.toLowerCase()).not.toContain(B.toLowerCase());
    expect(text.toLowerCase()).not.toMatch(/access|permission|forbidden/);
  });

  test('CE6: Bulk export under A contains only eventId=A rows', async ({ page, request }) => {
    const A = env('EVENT_A_ID');
    await signInAs(page, env('E2E_SUPER_USERNAME'), env('E2E_SUPER_PASSWORD'));
    const res = await request.get(`/api/events/${A}/exports/delegates`);
    expect(res.status()).toBe(200);
    const csv = await res.text();
    // Every data row must contain eventId=A in its eventId column (seed data
    // includes an eventId column; export's deep-assertion column is verified
    // by the contract, not implementation).
    const dataRows = csv.split('\n').slice(1).filter(Boolean);
    expect(dataRows.length).toBeGreaterThan(0);
    for (const row of dataRows) expect(row).toContain(A);
  });

  test('CE10: Malformed eventId returns 404 (not 400, not 500)', async ({ page, request }) => {
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    const badIds = [
      'not-a-uuid',
      '00000000-0000-0000-0000-000000000000',
      'DROP-TABLE-events--',
    ];
    for (const bad of badIds) {
      const res = await request.get(`/events/${bad}/people`);
      expect(res.status(), `id=${bad}`).toBe(404);
    }
  });

  test('CE11: Read-only sees only their assigned events in list', async ({ page }) => {
    await signInAs(page, env('E2E_READONLY_A_USERNAME'), env('E2E_READONLY_A_PASSWORD'));
    await page.goto('/dashboard');
    // Event selector / dashboard list contains ONLY event A, not event B.
    const eventCards = await page.getByRole('link').all();
    const hrefs = await Promise.all(eventCards.map((c) => c.getAttribute('href')));
    const eventHrefs = hrefs.filter((h) => h && h.startsWith('/events/'));
    const A = env('EVENT_A_ID');
    const B = env('EVENT_B_ID');
    expect(eventHrefs.some((h) => h!.includes(A))).toBe(true);
    expect(eventHrefs.some((h) => h!.includes(B))).toBe(false);
  });

  test('CE12: Super Admin cross-event access is audited', async ({ page, request }) => {
    const B = env('EVENT_B_ID');
    await signInAs(page, env('E2E_SUPER_USERNAME'), env('E2E_SUPER_PASSWORD'));
    await page.goto(`/events/${B}/people`);
    const audit = await request.get(
      `/api/test/audit-log?event_id=${B}&actor_username=${encodeURIComponent(env('E2E_SUPER_USERNAME'))}`,
    );
    expect(audit.status()).toBe(200);
    const rows = await audit.json();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({ action: 'read', resource: 'people', eventId: B });
  });

  test('CE14: Person fetched under A does not include B-scoped attributes', async ({ page, request }) => {
    const A = env('EVENT_A_ID');
    const pid = env('E2E_SHARED_PERSON_ID'); // person present in both A and B
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    const res = await request.get(`/api/events/${A}/people/${pid}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Master fields present
    expect(body.person).toBeTruthy();
    // Event-scoped attributes only reference A
    if (body.travel) expect(body.travel.eventId).toBe(A);
    if (body.sessions) {
      for (const s of body.sessions) expect(s.eventId).toBe(A);
    }
  });
});

test.describe('eventid-scoping — Invariant spot checks', () => {
  test('I5 + D2: 403 is reserved for role-based denial INSIDE assigned event', async ({ page, request }) => {
    const A = env('EVENT_A_ID');
    // read_only on A tries to mutate — expect 403 (NOT 404, because they ARE a member)
    await signInAs(page, env('E2E_READONLY_A_USERNAME'), env('E2E_READONLY_A_PASSWORD'));
    const res = await request.post(`/api/events/${A}/sessions`, {
      data: { title: 'X', startsAt: '2026-05-01T10:00:00Z', endsAt: '2026-05-01T11:00:00Z' },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'forbidden' });
  });

  test('I10: Notification idempotency keys include eventId and do not collide across events', async ({ request }) => {
    // Test-only endpoint returns the last-used idempotency key for a send
    const A = env('EVENT_A_ID');
    const B = env('EVENT_B_ID');
    const userId = env('E2E_COORD_AB_USER_ID');
    const aKey = await request
      .get(`/api/test/last-notification-key?userId=${userId}&eventId=${A}&type=travel_confirmed&triggerId=t1`)
      .then((r) => r.text());
    const bKey = await request
      .get(`/api/test/last-notification-key?userId=${userId}&eventId=${B}&type=travel_confirmed&triggerId=t1`)
      .then((r) => r.text());
    expect(aKey).not.toBe(bKey);
    expect(aKey).toContain(A);
    expect(bKey).toContain(B);
  });
});
