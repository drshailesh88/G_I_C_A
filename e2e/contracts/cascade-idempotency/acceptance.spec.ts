// FROZEN CONTRACT — DO NOT EDIT
// Approved by: Shailesh Singh on 2026-04-14
// Source: e2e/contracts/cascade-idempotency/examples.md + counterexamples.md
//
// Red-phase expected. Requires seed fixtures + test probe endpoints.
//
// Seed env vars (.env.test.local):
//   EVENT_A_ID, EVENT_B_ID
//   E2E_COORD_A_USERNAME / ..._PASSWORD
//   E2E_SUPER_USERNAME / ..._PASSWORD
//   E2E_DELEGATE_A_PERSON_ID            person in A with registration + contact
//   E2E_DELEGATE_A_USER_ID              Clerk user id for that person
//   E2E_DELEGATE_AB_PERSON_ID           person in both A and B
//   E2E_TRAVEL_A_ID                     existing travel record in A
//   E2E_ACCOM_A_ID                      existing accommodation record in A
//
// Test-only probe endpoints (NODE_ENV==='test' guarded):
//   GET /api/test/inngest-events?name=&after=       list emitted events
//   GET /api/test/notification-log?idempotency_key=|?triggerId=
//   GET /api/test/redis-key?key=                    returns value or null
//   GET /api/test/red-flags?event_id=&flag_type=
//   GET /api/test/sentry-events?kind=cascade-dispatch-failure
//   POST /api/test/provider-mode                   switch Resend/Evolution between normal|fail|fail-n|flaky
//   POST /api/test/inngest-replay                  replay a previously-captured event
//   POST /api/test/seed/travel-update              emulate a server action that triggers travel.updated
//   POST /api/test/seed/travel-create              emulate travel.created server action
//   POST /api/test/seed/registration-create        emulate registration.created
//   POST /api/test/archive-event                   transition event to archived state

import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env var ${k}`);
  return v;
};

test.beforeAll(async () => { await clerkSetup(); });

async function signInAs(page: Page, user: string, pass: string) {
  await page.goto('/login');
  await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: user, password: pass } });
}

async function logsByTrigger(req: APIRequestContext, triggerId: string) {
  const r = await req.get(`/api/test/notification-log?triggerId=${triggerId}`);
  expect(r.status()).toBe(200);
  return (await r.json()) as Array<{
    idempotency_key: string; channel: 'email' | 'whatsapp';
    status: 'pending' | 'sent' | 'failed'; attempts: number;
    last_error?: string | null; sent_at?: string | null;
  }>;
}

async function setProviderMode(req: APIRequestContext, channel: 'email' | 'whatsapp', mode: 'normal' | 'fail' | { failN: number }) {
  const r = await req.post('/api/test/provider-mode', { data: { channel, mode } });
  expect(r.status()).toBe(200);
}

async function waitFor(fn: () => Promise<boolean>, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('waitFor timeout');
}

test.describe('cascade-idempotency — Happy paths', () => {
  test('Example 1: travel.created → one email + one whatsapp send', async ({ request, page }) => {
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    await setProviderMode(request, 'email', 'normal');
    await setProviderMode(request, 'whatsapp', 'normal');
    const seed = await request.post('/api/test/seed/travel-create', {
      data: { eventId: env('EVENT_A_ID'), personId: env('E2E_DELEGATE_A_PERSON_ID') },
    });
    const { travelId } = await seed.json();
    await waitFor(async () => {
      const logs = await logsByTrigger(request, travelId);
      return logs.length === 2 && logs.every((l) => l.status === 'sent');
    });
    const logs = await logsByTrigger(request, travelId);
    const channels = logs.map((l) => l.channel).sort();
    expect(channels).toEqual(['email', 'whatsapp']);
    for (const l of logs) {
      expect(l.attempts).toBe(1);
      expect(l.idempotency_key).toMatch(
        new RegExp(`^notification:.+:${env('EVENT_A_ID')}:travel_confirmed:${travelId}:(email|whatsapp)$`),
      );
    }
  });

  test('Example 3: debounce window coalesces two rapid updates', async ({ request, page }) => {
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    const travelId = env('E2E_TRAVEL_A_ID');
    // Two edits within 2 seconds
    await request.post('/api/test/seed/travel-update', { data: { travelId, patch: { flightTime: '09:10' } } });
    await request.post('/api/test/seed/travel-update', { data: { travelId, patch: { seat: '12A' } } });
    await waitFor(async () => {
      const logs = await logsByTrigger(request, travelId);
      return logs.length >= 2 && logs.every((l) => l.status === 'sent');
    });
    // Exactly one Inngest event in the debounce window
    const events = await request.get(
      `/api/test/inngest-events?name=conference/travel.updated&triggerId=${travelId}&window_seconds=10`,
    );
    const rows = await events.json();
    expect(rows.length).toBe(1);
    expect(rows[0].payload.changeSummary).toHaveProperty('flightTime');
    expect(rows[0].payload.changeSummary).toHaveProperty('seat');
    // Exactly one log row per channel
    const logs = await logsByTrigger(request, travelId);
    expect(new Set(logs.map((l) => l.channel)).size).toBe(2);
  });

  test('Example 4: retry uses the same key, attempts counter increments', async ({ request, page }) => {
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    await setProviderMode(request, 'email', { failN: 2 });
    await setProviderMode(request, 'whatsapp', 'normal');
    const seed = await request.post('/api/test/seed/travel-create', {
      data: { eventId: env('EVENT_A_ID'), personId: env('E2E_DELEGATE_A_PERSON_ID') },
    });
    const { travelId } = await seed.json();
    await waitFor(async () => {
      const logs = await logsByTrigger(request, travelId);
      const email = logs.find((l) => l.channel === 'email');
      return !!(email && email.status === 'sent' && email.attempts === 3);
    });
    const logs = await logsByTrigger(request, travelId);
    const email = logs.find((l) => l.channel === 'email')!;
    expect(email.attempts).toBe(3);
    expect(email.status).toBe('sent');
  });

  test('Example 5: duplicate cascade event is a no-op (idempotency key hit)', async ({ request, page }) => {
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    await setProviderMode(request, 'email', 'normal');
    await setProviderMode(request, 'whatsapp', 'normal');
    const seed = await request.post('/api/test/seed/travel-create', {
      data: { eventId: env('EVENT_A_ID'), personId: env('E2E_DELEGATE_A_PERSON_ID') },
    });
    const { travelId, inngestEventId } = await seed.json();
    await waitFor(async () => {
      const logs = await logsByTrigger(request, travelId);
      return logs.length === 2 && logs.every((l) => l.status === 'sent');
    });
    const before = await logsByTrigger(request, travelId);
    // Replay the exact same Inngest event
    const replay = await request.post('/api/test/inngest-replay', { data: { eventId: inngestEventId } });
    expect(replay.status()).toBe(200);
    await new Promise((r) => setTimeout(r, 3000));
    const after = await logsByTrigger(request, travelId);
    for (const ch of ['email', 'whatsapp'] as const) {
      const b = before.find((l) => l.channel === ch)!;
      const a = after.find((l) => l.channel === ch)!;
      expect(a.attempts).toBe(b.attempts); // did NOT increment
      expect(a.status).toBe('sent');
    }
  });
});

test.describe('cascade-idempotency — Counterexamples', () => {
  test('CE1: No duplicate provider calls for the same trigger', async ({ request, page }) => {
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    await setProviderMode(request, 'email', 'normal');
    await setProviderMode(request, 'whatsapp', 'normal');
    const seed = await request.post('/api/test/seed/travel-create', {
      data: { eventId: env('EVENT_A_ID'), personId: env('E2E_DELEGATE_A_PERSON_ID') },
    });
    const { travelId } = await seed.json();
    // Fire replays before, during, after
    for (let i = 0; i < 5; i++) {
      await request.post('/api/test/inngest-replay', { data: { triggerId: travelId } }).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 5000));
    const logs = await logsByTrigger(request, travelId);
    expect(logs.length).toBe(2); // one row per channel
    for (const l of logs) expect(l.attempts).toBe(1);
  });

  test('CE6: Upstream mutation is NOT rolled back when downstream send fails', async ({ request, page }) => {
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    await setProviderMode(request, 'email', 'fail');
    await setProviderMode(request, 'whatsapp', 'fail');
    const travelId = env('E2E_TRAVEL_A_ID');
    const rowBefore = await (await request.get(`/api/test/state?entity=travel_records&eventId=${env('EVENT_A_ID')}&id=${travelId}`)).json();
    await request.post('/api/test/seed/travel-update', { data: { travelId, patch: { flightTime: '07:30' } } });
    await waitFor(async () => {
      const logs = await logsByTrigger(request, travelId);
      const email = logs.find((l) => l.channel === 'email');
      return !!(email && email.status === 'failed' && email.attempts === 3);
    });
    const rowAfter = await (await request.get(`/api/test/state?entity=travel_records&eventId=${env('EVENT_A_ID')}&id=${travelId}`)).json();
    expect(rowAfter.flightTime).toBe('07:30'); // persisted despite notification failure
    expect(rowAfter.id).toBe(rowBefore.id);
  });

  test('CE7: Stale payload not used — snapshot at emit time is sent', async ({ request, page }) => {
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    await setProviderMode(request, 'email', 'normal');
    await setProviderMode(request, 'whatsapp', 'normal');
    const travelId = env('E2E_TRAVEL_A_ID');
    // Slow the handler via provider flaky mode so we have a window
    await setProviderMode(request, 'email', { failN: 1 });
    await request.post('/api/test/seed/travel-update', { data: { travelId, patch: { arrivalTime: '09:00' } } });
    // After emit, change DB
    await new Promise((r) => setTimeout(r, 500));
    await request.post('/api/test/seed/travel-update-silent', { data: { travelId, patch: { arrivalTime: '11:00' } } });
    await waitFor(async () => {
      const logs = await logsByTrigger(request, travelId);
      return logs.some((l) => l.status === 'sent');
    });
    // Probe the body of the last sent message
    const sent = await (await request.get(`/api/test/last-sent-body?triggerId=${travelId}&channel=email`)).json();
    expect(sent.body).toContain('09:00');
    expect(sent.body).not.toContain('11:00');
  });

  test('CE8: Red flag is upserted, not duplicated', async ({ request, page }) => {
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    const accomId = env('E2E_ACCOM_A_ID');
    // Three updates spaced beyond debounce window (6s)
    for (let i = 0; i < 3; i++) {
      await request.post('/api/test/seed/accommodation-update', { data: { accomId, patch: { notes: `v${i}` } } });
      await new Promise((r) => setTimeout(r, 6500));
    }
    await new Promise((r) => setTimeout(r, 3000));
    const flags = await (await request.get(
      `/api/test/red-flags?event_id=${env('EVENT_A_ID')}&target_entity_id=${accomId}&flag_type=accommodation_change`,
    )).json();
    const active = flags.filter((f: any) => f.flag_status !== 'resolved');
    expect(active.length).toBe(1);
  });

  test('CE9 + CE19: Handler never writes to another event', async ({ request, page }) => {
    await signInAs(page, env('E2E_SUPER_USERNAME'), env('E2E_SUPER_PASSWORD'));
    const A = env('EVENT_A_ID');
    const B = env('EVENT_B_ID');
    const snapB = await (await request.get(`/api/test/full-snapshot?eventId=${B}`)).json();
    await setProviderMode(request, 'email', 'normal');
    await setProviderMode(request, 'whatsapp', 'normal');
    const seed = await request.post('/api/test/seed/travel-create', { data: { eventId: A, personId: env('E2E_DELEGATE_A_PERSON_ID') } });
    const { travelId } = await seed.json();
    await waitFor(async () => {
      const logs = await logsByTrigger(request, travelId);
      return logs.length === 2 && logs.every((l) => l.status === 'sent');
    });
    const snapBAfter = await (await request.get(`/api/test/full-snapshot?eventId=${B}`)).json();
    expect(snapBAfter.checksum).toBe(snapB.checksum);
  });

  test('CE10: Malformed payload is dead-lettered, not retried', async ({ request, page }) => {
    await signInAs(page, env('E2E_SUPER_USERNAME'), env('E2E_SUPER_PASSWORD'));
    const r = await request.post('/api/test/inngest-emit', {
      data: { name: 'conference/travel.updated', payload: { /* missing eventId */ personId: 'x', travelId: 'y' } },
    });
    const { eventId } = await r.json();
    await new Promise((rs) => setTimeout(rs, 5000));
    const attempts = await (await request.get(`/api/test/inngest-attempts?eventId=${eventId}`)).json();
    expect(attempts.count).toBe(1);
    const sentry = await (await request.get(`/api/test/sentry-events?kind=cascade-payload-invalid&inngestEventId=${eventId}`)).json();
    expect(sentry.length).toBeGreaterThan(0);
  });

  test('CE12: Keys include channel suffix; email success does not block whatsapp retry', async ({ request, page }) => {
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    await setProviderMode(request, 'email', 'normal');
    await setProviderMode(request, 'whatsapp', { failN: 2 });
    const seed = await request.post('/api/test/seed/travel-create', {
      data: { eventId: env('EVENT_A_ID'), personId: env('E2E_DELEGATE_A_PERSON_ID') },
    });
    const { travelId } = await seed.json();
    await waitFor(async () => {
      const logs = await logsByTrigger(request, travelId);
      const wa = logs.find((l) => l.channel === 'whatsapp');
      return !!(wa && wa.status === 'sent' && wa.attempts === 3);
    });
    const logs = await logsByTrigger(request, travelId);
    const email = logs.find((l) => l.channel === 'email')!;
    const wa = logs.find((l) => l.channel === 'whatsapp')!;
    expect(email.idempotency_key).toMatch(/:email$/);
    expect(wa.idempotency_key).toMatch(/:whatsapp$/);
    expect(email.idempotency_key).not.toBe(wa.idempotency_key);
    expect(email.attempts).toBe(1);
    expect(wa.attempts).toBe(3);
  });

  test('CE15: Final failure surfaces to ops (log.failed + Sentry + red flag)', async ({ request, page }) => {
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    await setProviderMode(request, 'email', 'fail');
    await setProviderMode(request, 'whatsapp', 'normal');
    const seed = await request.post('/api/test/seed/travel-create', {
      data: { eventId: env('EVENT_A_ID'), personId: env('E2E_DELEGATE_A_PERSON_ID') },
    });
    const { travelId } = await seed.json();
    await waitFor(async () => {
      const logs = await logsByTrigger(request, travelId);
      const email = logs.find((l) => l.channel === 'email');
      return !!(email && email.status === 'failed' && email.attempts === 3);
    });
    const sentry = await (await request.get(`/api/test/sentry-events?kind=cascade-dispatch-failure&triggerId=${travelId}`)).json();
    expect(sentry.length).toBeGreaterThan(0);
    const flags = await (await request.get(
      `/api/test/red-flags?event_id=${env('EVENT_A_ID')}&flag_type=system_dispatch_failure&target_entity_id=${travelId}`,
    )).json();
    expect(flags.some((f: any) => f.flag_status !== 'resolved')).toBe(true);
  });

  test('CE17: In-flight cascade completes even after event archival', async ({ request, page }) => {
    await signInAs(page, env('E2E_SUPER_USERNAME'), env('E2E_SUPER_PASSWORD'));
    await setProviderMode(request, 'email', 'normal');
    await setProviderMode(request, 'whatsapp', 'normal');
    const seed = await request.post('/api/test/seed/travel-create', {
      data: { eventId: env('EVENT_A_ID'), personId: env('E2E_DELEGATE_A_PERSON_ID'), delayMs: 2000 },
    });
    const { travelId } = await seed.json();
    // Archive event while handler is in-flight
    await request.post('/api/test/archive-event', { data: { eventId: env('EVENT_A_ID') } });
    await waitFor(async () => {
      const logs = await logsByTrigger(request, travelId);
      return logs.length === 2 && logs.every((l) => l.status === 'sent');
    });
    // Restore to active for other tests
    await request.post('/api/test/archive-event', { data: { eventId: env('EVENT_A_ID'), state: 'active' } });
  });

  test('CE18: One notification_log row per (key); retries UPDATE not INSERT', async ({ request, page }) => {
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    await setProviderMode(request, 'email', { failN: 2 });
    await setProviderMode(request, 'whatsapp', 'normal');
    const seed = await request.post('/api/test/seed/travel-create', {
      data: { eventId: env('EVENT_A_ID'), personId: env('E2E_DELEGATE_A_PERSON_ID') },
    });
    const { travelId } = await seed.json();
    await waitFor(async () => {
      const logs = await logsByTrigger(request, travelId);
      const email = logs.find((l) => l.channel === 'email');
      return !!(email && email.status === 'sent' && email.attempts === 3);
    });
    const count = await (await request.get(
      `/api/test/notification-log-row-count?triggerId=${travelId}&channel=email`,
    )).json();
    expect(count.rows).toBe(1);
  });
});
