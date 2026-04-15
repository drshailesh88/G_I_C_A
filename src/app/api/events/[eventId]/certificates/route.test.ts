import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSelect, mockAssertEventAccess, mockIssueCertificate, EventNotFoundError } = vi.hoisted(() => {
  class EventNotFoundError extends Error {
    constructor() { super('Not found'); this.name = 'EventNotFoundError'; }
  }
  return {
    mockSelect: vi.fn(),
    mockAssertEventAccess: vi.fn(),
    mockIssueCertificate: vi.fn(),
    EventNotFoundError,
  };
});

vi.mock('@/lib/db', () => ({ db: { select: mockSelect } }));
vi.mock('@/lib/db/schema', () => ({
  events: { id: 'events.id', startDate: 'events.start_date', endDate: 'events.end_date' },
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => args),
}));
vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
  EventNotFoundError,
}));
vi.mock('@/lib/actions/certificate-issuance', () => ({
  issueCertificate: mockIssueCertificate,
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { issueCertificateRequestSchema, POST } from './route';

describe('POST /api/events/[eventId]/certificates — Zod schema', () => {
  it('rejects missing required fields', () => {
    const result = issueCertificateRequestSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldNames = result.error.issues.map((i) => i.path[0]);
      expect(fieldNames).toContain('person_id');
      expect(fieldNames).toContain('certificate_type');
      expect(fieldNames).toContain('template_id');
    }
  });

  it('accepts valid body and transforms to camelCase', () => {
    const result = issueCertificateRequestSchema.safeParse({
      person_id: '550e8400-e29b-41d4-a716-446655440000',
      certificate_type: 'delegate_attendance',
      template_id: '660e8400-e29b-41d4-a716-446655440001',
      eligibility_basis_type: 'registration',
      eligibility_basis_id: '770e8400-e29b-41d4-a716-446655440002',
      variables: { full_name: 'Jane Doe' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        personId: '550e8400-e29b-41d4-a716-446655440000',
        certificateType: 'delegate_attendance',
        templateId: '660e8400-e29b-41d4-a716-446655440001',
        eligibilityBasisType: 'registration',
        eligibilityBasisId: '770e8400-e29b-41d4-a716-446655440002',
        renderedVariablesJson: { full_name: 'Jane Doe' },
      });
    }
  });

  it('rejects invalid certificate_type', () => {
    const result = issueCertificateRequestSchema.safeParse({
      person_id: '550e8400-e29b-41d4-a716-446655440000',
      certificate_type: 'invalid_type',
      template_id: '660e8400-e29b-41d4-a716-446655440001',
      eligibility_basis_type: 'registration',
      variables: {},
    });
    expect(result.success).toBe(false);
  });

  it('allows eligibility_basis_id to be null', () => {
    const result = issueCertificateRequestSchema.safeParse({
      person_id: '550e8400-e29b-41d4-a716-446655440000',
      certificate_type: 'faculty_participation',
      template_id: '660e8400-e29b-41d4-a716-446655440001',
      eligibility_basis_type: 'manual',
      eligibility_basis_id: null,
      variables: {},
    });
    expect(result.success).toBe(true);
  });
});

describe('POST /api/events/[eventId]/certificates — RBAC', () => {
  const eventId = '550e8400-e29b-41d4-a716-446655440000';
  const params = Promise.resolve({ eventId });

  function makeRequest(body: unknown) {
    return new Request('http://localhost:4000/api/events/' + eventId + '/certificates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  const validBody = {
    person_id: '660e8400-e29b-41d4-a716-446655440001',
    certificate_type: 'delegate_attendance',
    template_id: '770e8400-e29b-41d4-a716-446655440002',
    eligibility_basis_type: 'registration',
    variables: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 for ops role', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:ops' });

    const res = await POST(makeRequest(validBody), { params });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('forbidden');
  });

  it('returns 403 for read_only role', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:read_only' });

    const res = await POST(makeRequest(validBody), { params });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('forbidden');
  });

  it('allows event_coordinator role', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:event_coordinator' });
    mockIssueCertificate.mockResolvedValue({
      id: 'cert-1',
      certificateNumber: 'GEM2026-ATT-00001',
      verificationToken: 'tok-1',
    });

    const res = await POST(makeRequest(validBody), { params });
    expect(res.status).toBe(201);
  });
});

describe('POST /api/events/[eventId]/certificates — archived event', () => {
  const eventId = '550e8400-e29b-41d4-a716-446655440000';
  const params = Promise.resolve({ eventId });

  const validBody = {
    person_id: '660e8400-e29b-41d4-a716-446655440001',
    certificate_type: 'delegate_attendance',
    template_id: '770e8400-e29b-41d4-a716-446655440002',
    eligibility_basis_type: 'registration',
    variables: {},
  };

  function makeRequest(body: unknown) {
    return new Request('http://localhost:4000/api/events/' + eventId + '/certificates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when event is archived', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
    mockIssueCertificate.mockRejectedValue(new Error('Event is archived — certificate issuance is blocked'));

    const res = await POST(makeRequest(validBody), { params });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('event archived');
  });
});

describe('POST /api/events/[eventId]/certificates — person-event attachment', () => {
  const eventId = '550e8400-e29b-41d4-a716-446655440000';
  const params = Promise.resolve({ eventId });

  const validBody = {
    person_id: '660e8400-e29b-41d4-a716-446655440001',
    certificate_type: 'delegate_attendance',
    template_id: '770e8400-e29b-41d4-a716-446655440002',
    eligibility_basis_type: 'registration',
    variables: {},
  };

  function makeRequest(body: unknown) {
    return new Request('http://localhost:4000/api/events/' + eventId + '/certificates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when person is not attached to event', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
    mockIssueCertificate.mockRejectedValue(new Error('person not attached to event'));

    const res = await POST(makeRequest(validBody), { params });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('person not attached to event');
  });

  it('returns 201 when person is attached to event', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
    mockIssueCertificate.mockResolvedValue({
      id: 'cert-1',
      certificateNumber: 'GEM2026-ATT-00001',
      verificationToken: 'tok-1',
    });

    const res = await POST(makeRequest(validBody), { params });
    expect(res.status).toBe(201);
  });
});

describe('POST /api/events/[eventId]/certificates — CME validation', () => {
  const eventId = '550e8400-e29b-41d4-a716-446655440000';
  const params = Promise.resolve({ eventId });

  const validCmeBody = {
    person_id: '660e8400-e29b-41d4-a716-446655440001',
    certificate_type: 'cme_attendance',
    template_id: '770e8400-e29b-41d4-a716-446655440002',
    eligibility_basis_type: 'attendance',
    variables: {
      cme_credit_hours: 8,
      accrediting_body_name: 'Medical Council of India',
      accreditation_code: 'MCI-2026-001',
      cme_claim_text: 'Planned per MCI standards.',
    },
  };

  function makeRequest(body: unknown) {
    return new Request('http://localhost:4000/api/events/' + eventId + '/certificates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function setupMocks(eventDurationHours: number) {
    const start = new Date('2026-04-10T09:00:00Z');
    const end = new Date(start.getTime() + eventDurationHours * 60 * 60 * 1000);

    mockAssertEventAccess.mockResolvedValue({ userId: 'user1', role: 'org:super_admin' });

    const chain = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ startDate: start, endDate: end }]),
    };
    mockSelect.mockReturnValue(chain);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when cme_credit_hours exceeds event duration', async () => {
    setupMocks(12);
    const body = {
      ...validCmeBody,
      variables: { ...validCmeBody.variables, cme_credit_hours: 13 },
    };

    const res = await POST(makeRequest(body), { params });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('validation_failed');
    expect(json.fields).toHaveProperty('cme_credit_hours');
  });

  it('returns 400 when CME field is missing', async () => {
    setupMocks(12);
    const { accrediting_body_name, ...rest } = validCmeBody.variables;
    const body = { ...validCmeBody, variables: rest };

    const res = await POST(makeRequest(body), { params });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.fields).toHaveProperty('accrediting_body_name');
  });

  it('returns 400 when cme_credit_hours is 0', async () => {
    setupMocks(12);
    const body = {
      ...validCmeBody,
      variables: { ...validCmeBody.variables, cme_credit_hours: 0 },
    };

    const res = await POST(makeRequest(body), { params });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.fields).toHaveProperty('cme_credit_hours');
  });

  it('returns 400 when cme_credit_hours is negative', async () => {
    setupMocks(12);
    const body = {
      ...validCmeBody,
      variables: { ...validCmeBody.variables, cme_credit_hours: -1 },
    };

    const res = await POST(makeRequest(body), { params });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.fields).toHaveProperty('cme_credit_hours');
  });

  it('passes CME validation and calls issueCertificate for valid CME body', async () => {
    setupMocks(12);
    mockIssueCertificate.mockResolvedValue({
      id: 'cert-1',
      certificateNumber: 'GEM2026-CME-00001',
      verificationToken: 'tok-1',
    });

    const res = await POST(makeRequest(validCmeBody), { params });
    expect(res.status).toBe(201);
    expect(mockIssueCertificate).toHaveBeenCalledOnce();
  });
});
