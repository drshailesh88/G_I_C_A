// FROZEN CONTRACT — DO NOT EDIT
// Approved by: Shailesh Singh on 2026-04-14
// Source: e2e/contracts/certificates/examples.md + counterexamples.md
//
// Red-phase expected until seed fixtures and test probes exist.
//
// Seed-data requirements (env vars in .env.test.local):
//   E2E_SUPER_USERNAME / E2E_SUPER_PASSWORD      — super_admin
//   E2E_COORD_A_USERNAME / ..._PASSWORD          — event_coordinator on A
//   E2E_OPS_A_USERNAME / ..._PASSWORD            — ops on A
//   E2E_READONLY_A_USERNAME / ..._PASSWORD       — read_only on A
//   EVENT_A_ID                                   — active event
//   EVENT_B_ID                                   — another active event (cross-event tests)
//   EVENT_ARCHIVED_ID                            — event with state='archived'
//   CERT_TEMPLATE_DELEGATE_ATT_ID                — active delegate_attendance template for A
//   CERT_TEMPLATE_CME_ID                         — active cme_attendance template for A
//   E2E_PERSON_ATTENDED_A_ID                     — person with event_people row in A + attendance
//   E2E_PERSON_ONLY_B_ID                         — person in B, NOT in A
//   E2E_EVENT_A_DURATION_HOURS                   — e.g. "12"
//
// Test-only probe endpoints (behind NODE_ENV==='test'):
//   GET /api/test/cert/{id}                      — full row
//   GET /api/test/cert-by-number/{number}        — full row
//   GET /api/test/cert-count?event_id=&type=&status=&person_id=
//   GET /api/test/cert-lock?event_id=&type=      — lock state
//   POST /api/test/cert-lock/hold                — test-only manual lock (for CE7)
//   DELETE /api/test/cert-lock/release           — test-only force-release
//   GET /api/test/audit-log?resource=certificate&cert_id=

import { test, expect, Page, APIRequestContext } from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env var ${k}`);
  return v;
};

test.beforeAll(async () => {
  await clerkSetup();
});

async function signInAs(page: Page, user: string, pass: string) {
  await page.goto('/login');
  await clerk.signIn({ page, signInParams: { strategy: 'password', identifier: user, password: pass } });
}

async function getCert(req: APIRequestContext, id: string) {
  const r = await req.get(`/api/test/cert/${id}`);
  expect(r.status()).toBe(200);
  return r.json();
}

test.describe('certificates — Happy paths', () => {
  test('Example 1: Single issue — delegate_attendance', async ({ page, request }) => {
    const A = env('EVENT_A_ID');
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    const res = await request.post(`/api/events/${A}/certificates`, {
      data: {
        person_id: env('E2E_PERSON_ATTENDED_A_ID'),
        certificate_type: 'delegate_attendance',
        template_id: env('CERT_TEMPLATE_DELEGATE_ATT_ID'),
        eligibility_basis_type: 'attendance',
        variables: { full_name: 'Dr. Priya Patel', salutation: 'Dr.' },
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('issued');
    expect(body.certificate_number).toMatch(/^[A-Z0-9]+-ATT-\d{5}$/);
    expect(body.verification_token).toMatch(/^[0-9a-f-]{36}$/);

    const full = await getCert(request, body.id);
    expect(full.storage_key).toBeTruthy();
    expect(full.pdf_url ?? null).toBeNull();
    expect(full.template_snapshot_json).toBeTruthy();
    expect(full.rendered_variables_json).toBeTruthy();
    expect(full.issued_at).toBeTruthy();
    expect(full.issued_by).toBeTruthy();
  });

  test('Example 2: Regeneration creates supersession chain (no revoke)', async ({ page, request }) => {
    const A = env('EVENT_A_ID');
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    const first = await request.post(`/api/events/${A}/certificates`, {
      data: {
        person_id: env('E2E_PERSON_ATTENDED_A_ID'),
        certificate_type: 'delegate_attendance',
        template_id: env('CERT_TEMPLATE_DELEGATE_ATT_ID'),
        eligibility_basis_type: 'attendance',
        variables: { full_name: 'Priya' },
      },
    });
    const v1 = await first.json();
    const regen = await request.post(`/api/events/${A}/certificates/${v1.id}/regenerate`, { data: {} });
    expect(regen.status()).toBe(201);
    const v2 = await regen.json();
    expect(v2.supersedes_id).toBe(v1.id);
    expect(v2.certificate_number).not.toBe(v1.certificate_number);
    const v1After = await getCert(request, v1.id);
    expect(v1After.status).toBe('superseded');
    expect(v1After.superseded_by_id).toBe(v2.id);
    expect(v1After.revoked_at ?? null).toBeNull();

    // Public verify of v1 token
    const verifyV1 = await request.get(`/verify/${v1.verification_token}`);
    expect(verifyV1.status()).toBe(200);
    const verifyV1Body = await verifyV1.json();
    expect(verifyV1Body.status).toBe('superseded');
    expect(verifyV1Body.superseded_by_certificate_number).toBe(v2.certificate_number);
    expect(JSON.stringify(verifyV1Body)).not.toMatch(/pdf_url|storage_key|download_url/i);
  });

  test('Example 3: Revocation shows transparent status on public verify', async ({ page, request }) => {
    const A = env('EVENT_A_ID');
    await signInAs(page, env('E2E_SUPER_USERNAME'), env('E2E_SUPER_PASSWORD'));
    const issued = await request.post(`/api/events/${A}/certificates`, {
      data: {
        person_id: env('E2E_PERSON_ATTENDED_A_ID'),
        certificate_type: 'delegate_attendance',
        template_id: env('CERT_TEMPLATE_DELEGATE_ATT_ID'),
        eligibility_basis_type: 'attendance',
        variables: { full_name: 'Priya' },
      },
    });
    const c = await issued.json();
    const reason = 'duplicate attendance record later corrected';
    const revoke = await request.post(`/api/events/${A}/certificates/${c.id}/revoke`, { data: { reason } });
    expect(revoke.status()).toBe(200);
    const full = await getCert(request, c.id);
    expect(full.status).toBe('revoked');
    expect(full.revoke_reason).toBe(reason);
    expect(full.revoked_at).toBeTruthy();
    expect(full.superseded_by_id ?? null).toBeNull();

    const verify = await request.get(`/verify/${c.verification_token}`);
    const vBody = await verify.json();
    expect(vBody.status).toBe('revoked');
    expect(vBody.revoke_reason).toBe(reason);
    expect(vBody.revoked_at).toBeTruthy();
    expect(JSON.stringify(vBody)).not.toMatch(/pdf_url|storage_key|download_url/i);
  });

  test('Example 5: Concurrent bulk-generate is rejected with 409', async ({ page, request }) => {
    const A = env('EVENT_A_ID');
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    // Hold lock via test-only endpoint to simulate in-flight batch
    const hold = await request.post('/api/test/cert-lock/hold', {
      data: { event_id: A, type: 'delegate_attendance', lock_holder: 'seed-user', ttl_seconds: 300 },
    });
    expect(hold.status()).toBe(200);
    try {
      const res = await request.post(`/api/events/${A}/certificates/bulk`, {
        data: { certificate_type: 'delegate_attendance', scope: 'all' },
      });
      expect(res.status()).toBe(409);
      const body = await res.json();
      expect(body.error).toBe('generation in progress');
      expect(body.lock_holder).toBeTruthy();
      expect(body.expires_at).toBeTruthy();
    } finally {
      await request.delete('/api/test/cert-lock/release?event_id=' + A + '&type=delegate_attendance');
    }
  });

  test('Example 6: CME cert with all four required fields', async ({ page, request }) => {
    const A = env('EVENT_A_ID');
    const dur = Number(env('E2E_EVENT_A_DURATION_HOURS'));
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    const res = await request.post(`/api/events/${A}/certificates`, {
      data: {
        person_id: env('E2E_PERSON_ATTENDED_A_ID'),
        certificate_type: 'cme_attendance',
        template_id: env('CERT_TEMPLATE_CME_ID'),
        eligibility_basis_type: 'attendance',
        variables: {
          full_name: 'Priya',
          cme_credit_hours: Math.min(8, dur),
          accrediting_body_name: 'Medical Council of India',
          accreditation_code: 'MCI-2026-GEM-001',
          cme_claim_text: '8 hours CME credit claimed',
        },
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    const full = await getCert(request, body.id);
    expect(full.rendered_variables_json.cme_credit_hours).toBeLessThanOrEqual(dur);
    expect(full.rendered_variables_json.accrediting_body_name).toBe('Medical Council of India');
    expect(full.rendered_variables_json.accreditation_code).toBe('MCI-2026-GEM-001');
    expect(full.rendered_variables_json.cme_claim_text).toBeTruthy();
  });

  test('Example 7: Public verify returns only allowed fields', async ({ request, page }) => {
    const A = env('EVENT_A_ID');
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    const issued = await request.post(`/api/events/${A}/certificates`, {
      data: {
        person_id: env('E2E_PERSON_ATTENDED_A_ID'),
        certificate_type: 'delegate_attendance',
        template_id: env('CERT_TEMPLATE_DELEGATE_ATT_ID'),
        eligibility_basis_type: 'attendance',
        variables: { full_name: 'Priya' },
      },
    });
    const c = await issued.json();
    const verify = await request.get(`/verify/${c.verification_token}`);
    expect(verify.status()).toBe(200);
    const body = await verify.json();
    const allowed = new Set([
      'status', 'certificate_number', 'certificate_type', 'person_name',
      'event_name', 'issued_at', 'revoked_at', 'revoke_reason',
      'superseded_by_certificate_number',
    ]);
    for (const key of Object.keys(body)) {
      expect(allowed, `unexpected field: ${key}`).toContain(key);
    }
    // PII must not leak
    const txt = JSON.stringify(body).toLowerCase();
    expect(txt).not.toMatch(/email|phone|person_id|registration_id|postal|address/);
  });
});

test.describe('certificates — Counterexamples', () => {
  test('CE1: No two current valid certs per (person, event, type)', async ({ page, request }) => {
    const A = env('EVENT_A_ID');
    const p = env('E2E_PERSON_ATTENDED_A_ID');
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    // Fire 5 concurrent regenerations after seeding one issued cert
    const first = await request.post(`/api/events/${A}/certificates`, {
      data: {
        person_id: p,
        certificate_type: 'delegate_attendance',
        template_id: env('CERT_TEMPLATE_DELEGATE_ATT_ID'),
        eligibility_basis_type: 'attendance',
        variables: { full_name: 'Priya' },
      },
    });
    const v1 = await first.json();
    await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        request.post(`/api/events/${A}/certificates/${v1.id}/regenerate`, { data: {} }),
      ),
    );
    const count = await request.get(
      `/api/test/cert-count?event_id=${A}&type=delegate_attendance&status=issued&person_id=${p}`,
    );
    const c = await count.json();
    expect(c.count).toBe(1);
  });

  test('CE2 + CE3: Numbers unique + monotonic + no reuse after revoke', async ({ page, request }) => {
    const A = env('EVENT_A_ID');
    await signInAs(page, env('E2E_SUPER_USERNAME'), env('E2E_SUPER_PASSWORD'));
    const issue = () =>
      request
        .post(`/api/events/${A}/certificates`, {
          data: {
            person_id: env('E2E_PERSON_ATTENDED_A_ID'),
            certificate_type: 'delegate_attendance',
            template_id: env('CERT_TEMPLATE_DELEGATE_ATT_ID'),
            eligibility_basis_type: 'attendance',
            variables: { full_name: 'Priya' },
          },
        })
        .then((r) => r.json());
    const seq: string[] = [];
    // Issue three in sequence (each regenerates the previous current one)
    let prev = await issue();
    seq.push(prev.certificate_number);
    for (let i = 0; i < 2; i++) {
      const next = await request.post(`/api/events/${A}/certificates/${prev.id}/regenerate`, { data: {} }).then((r) => r.json());
      seq.push(next.certificate_number);
      prev = next;
    }
    // Revoke the current cert
    await request.post(`/api/events/${A}/certificates/${prev.id}/revoke`, { data: { reason: 'test' } });
    // Issue a new one — its number must not equal any previous number
    const fresh = await issue();
    expect(seq).not.toContain(fresh.certificate_number);
    // All seen numbers unique
    const all = [...seq, fresh.certificate_number];
    expect(new Set(all).size).toBe(all.length);
  });

  test('CE4 + CE5: Revoked cert public verify shows status=revoked + no download link', async ({ page, request }) => {
    const A = env('EVENT_A_ID');
    await signInAs(page, env('E2E_SUPER_USERNAME'), env('E2E_SUPER_PASSWORD'));
    const issued = await request.post(`/api/events/${A}/certificates`, {
      data: {
        person_id: env('E2E_PERSON_ATTENDED_A_ID'),
        certificate_type: 'delegate_attendance',
        template_id: env('CERT_TEMPLATE_DELEGATE_ATT_ID'),
        eligibility_basis_type: 'attendance',
        variables: { full_name: 'Priya' },
      },
    });
    const c = await issued.json();
    await request.post(`/api/events/${A}/certificates/${c.id}/revoke`, { data: { reason: 'test' } });
    const v = await request.get(`/verify/${c.verification_token}`);
    const body = await v.json();
    expect(body.status).toBe('revoked');
    expect(JSON.stringify(body)).not.toMatch(/pdf_url|storage_key|download_url|\.pdf/i);
  });

  test('CE10: CME cert rejected with missing/invalid fields', async ({ page, request }) => {
    const A = env('EVENT_A_ID');
    const dur = Number(env('E2E_EVENT_A_DURATION_HOURS'));
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    const bad = [
      { cme_credit_hours: null },
      { cme_credit_hours: 0 },
      { cme_credit_hours: -1 },
      { cme_credit_hours: dur + 1 },
      { accrediting_body_name: '' },
      { accreditation_code: '' },
      { cme_claim_text: '' },
    ];
    for (const patch of bad) {
      const res = await request.post(`/api/events/${A}/certificates`, {
        data: {
          person_id: env('E2E_PERSON_ATTENDED_A_ID'),
          certificate_type: 'cme_attendance',
          template_id: env('CERT_TEMPLATE_CME_ID'),
          eligibility_basis_type: 'attendance',
          variables: {
            full_name: 'Priya',
            cme_credit_hours: 2,
            accrediting_body_name: 'MCI',
            accreditation_code: 'X',
            cme_claim_text: 'claim',
            ...patch,
          },
        },
      });
      expect(res.status(), JSON.stringify(patch)).toBe(400);
    }
  });

  test('CE11 + CE12: Template + variables snapshots immutable', async ({ page, request }) => {
    const A = env('EVENT_A_ID');
    await signInAs(page, env('E2E_SUPER_USERNAME'), env('E2E_SUPER_PASSWORD'));
    const issued = await request.post(`/api/events/${A}/certificates`, {
      data: {
        person_id: env('E2E_PERSON_ATTENDED_A_ID'),
        certificate_type: 'delegate_attendance',
        template_id: env('CERT_TEMPLATE_DELEGATE_ATT_ID'),
        eligibility_basis_type: 'attendance',
        variables: { full_name: 'Dr. Priya' },
      },
    });
    const c = await issued.json();
    const before = await getCert(request, c.id);
    const snap1 = JSON.stringify(before.template_snapshot_json);
    const vars1 = JSON.stringify(before.rendered_variables_json);
    // Update person master data out of band (test-only seed mutation)
    await request.post('/api/test/seed/update-person', {
      data: { person_id: env('E2E_PERSON_ATTENDED_A_ID'), full_name: 'Dr. Priya Patel' },
    });
    // Edit template (coordinator action)
    await request.patch(`/api/events/${A}/certificate-templates/${env('CERT_TEMPLATE_DELEGATE_ATT_ID')}`, {
      data: { template_json: { version: Date.now() } },
    });
    const after = await getCert(request, c.id);
    expect(JSON.stringify(after.template_snapshot_json)).toBe(snap1);
    expect(JSON.stringify(after.rendered_variables_json)).toBe(vars1);
  });

  test('CE14: Ops and Read-only denied all cert mutations', async ({ page, request }) => {
    const A = env('EVENT_A_ID');
    const paths = [
      { method: 'POST' as const, url: `/api/events/${A}/certificates` },
      { method: 'POST' as const, url: `/api/events/${A}/certificates/bulk` },
    ];
    for (const role of [
      { user: env('E2E_OPS_A_USERNAME'), pass: env('E2E_OPS_A_PASSWORD') },
      { user: env('E2E_READONLY_A_USERNAME'), pass: env('E2E_READONLY_A_PASSWORD') },
    ]) {
      await signInAs(page, role.user, role.pass);
      for (const p of paths) {
        const res = await request.fetch(p.url, { method: p.method, data: {} });
        expect(res.status(), `${role.user} ${p.method} ${p.url}`).toBe(403);
      }
    }
  });

  test('CE15: Revoke without reason rejected', async ({ page, request }) => {
    const A = env('EVENT_A_ID');
    await signInAs(page, env('E2E_SUPER_USERNAME'), env('E2E_SUPER_PASSWORD'));
    const issued = await request.post(`/api/events/${A}/certificates`, {
      data: {
        person_id: env('E2E_PERSON_ATTENDED_A_ID'),
        certificate_type: 'delegate_attendance',
        template_id: env('CERT_TEMPLATE_DELEGATE_ATT_ID'),
        eligibility_basis_type: 'attendance',
        variables: { full_name: 'Priya' },
      },
    });
    const c = await issued.json();
    for (const body of [{}, { reason: '' }, { reason: '   ' }]) {
      const r = await request.post(`/api/events/${A}/certificates/${c.id}/revoke`, { data: body });
      expect(r.status(), JSON.stringify(body)).toBe(400);
    }
    const full = await getCert(request, c.id);
    expect(full.status).toBe('issued');
  });

  test('CE16: Cannot issue for person not attached to event', async ({ page, request }) => {
    const A = env('EVENT_A_ID');
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    const res = await request.post(`/api/events/${A}/certificates`, {
      data: {
        person_id: env('E2E_PERSON_ONLY_B_ID'),
        certificate_type: 'delegate_attendance',
        template_id: env('CERT_TEMPLATE_DELEGATE_ATT_ID'),
        eligibility_basis_type: 'attendance',
        variables: { full_name: 'X' },
      },
    });
    expect(res.status()).toBe(400);
  });

  test('CE17: Revoked cert signed URL denied to non-super-admin', async ({ page, request }) => {
    const A = env('EVENT_A_ID');
    await signInAs(page, env('E2E_SUPER_USERNAME'), env('E2E_SUPER_PASSWORD'));
    const issued = await request.post(`/api/events/${A}/certificates`, {
      data: {
        person_id: env('E2E_PERSON_ATTENDED_A_ID'),
        certificate_type: 'delegate_attendance',
        template_id: env('CERT_TEMPLATE_DELEGATE_ATT_ID'),
        eligibility_basis_type: 'attendance',
        variables: { full_name: 'Priya' },
      },
    });
    const c = await issued.json();
    await request.post(`/api/events/${A}/certificates/${c.id}/revoke`, { data: { reason: 'test' } });
    // Super admin can still download
    const superDl = await request.get(`/api/events/${A}/certificates/${c.id}/download`);
    expect(superDl.status()).toBe(200);
    const superBody = await superDl.json();
    expect(superBody.url).toMatch(/^https?:\/\//);
    // Coord cannot
    await signInAs(page, env('E2E_COORD_A_USERNAME'), env('E2E_COORD_A_PASSWORD'));
    const coordDl = await request.get(`/api/events/${A}/certificates/${c.id}/download`);
    expect([403, 404]).toContain(coordDl.status());
  });

  test('CE19: Cannot issue for archived event', async ({ page, request }) => {
    const X = env('EVENT_ARCHIVED_ID');
    await signInAs(page, env('E2E_SUPER_USERNAME'), env('E2E_SUPER_PASSWORD'));
    const res = await request.post(`/api/events/${X}/certificates`, {
      data: {
        person_id: env('E2E_PERSON_ATTENDED_A_ID'),
        certificate_type: 'delegate_attendance',
        template_id: env('CERT_TEMPLATE_DELEGATE_ATT_ID'),
        eligibility_basis_type: 'attendance',
        variables: { full_name: 'X' },
      },
    });
    expect([400, 404]).toContain(res.status());
  });
});
