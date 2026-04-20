import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAssertEventAccess, mockGenerateExport } = vi.hoisted(() => ({
  mockAssertEventAccess: vi.fn(),
  mockGenerateExport: vi.fn(),
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
  EventNotFoundError: class EventNotFoundError extends Error {},
}));

vi.mock('@/lib/auth/sanitize-cross-event-404', () => ({
  crossEvent404Response: vi.fn().mockReturnValue(
    new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    }),
  ),
}));

vi.mock('@/lib/exports/excel', () => ({
  generateExport: mockGenerateExport,
  EXPORT_TYPES: {
    'attendee-list': {
      label: 'Attendee List',
    },
  },
}));

import { GET } from './route';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeParams() {
  return {
    params: Promise.resolve({ eventId: EVENT_ID, type: 'attendee-list' }),
  };
}

describe('GET /api/events/[eventId]/exports/[type] adversarial coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'ops-1', role: 'org:ops' });
    mockGenerateExport.mockResolvedValue(Buffer.from('xlsx'));
  });

  it('should forbid ops users from exporting attendee PII', async () => {
    const res = await GET(
      new Request(`http://localhost:4000/api/events/${EVENT_ID}/exports/attendee-list`),
      makeParams(),
    );

    // BUG: export route only checks generic event read access, so org:ops can exfiltrate attendee exports.
    expect(res.status).toBe(403);
    expect(mockGenerateExport).not.toHaveBeenCalled();
  });
});
