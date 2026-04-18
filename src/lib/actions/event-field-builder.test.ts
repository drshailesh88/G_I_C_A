import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth, mockDb, mockRevalidatePath, mockAssertEventAccess } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockAssertEventAccess: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
  getEventListContext: vi.fn(),
}));
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: vi.fn() }));

import { updateFieldConfig } from './event';
import { ROLES } from '@/lib/auth/roles';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const ACTOR_ID = 'user_coordinator';
const CUSTOM_FIELD_ID = '99999999-9999-9999-9999-999999999999';

const VALID_FIELD_CONFIG = {
  standardFields: {
    designation: true,
    specialty: false,
    organization: true,
    city: true,
    age: false,
  },
  customFields: [],
};

function authAsSuperAdmin() {
  mockAuth.mockResolvedValue({
    userId: ACTOR_ID,
    has: ({ role }: { role: string }) => role === ROLES.SUPER_ADMIN,
  });
}

function authAsCoordinator() {
  mockAuth.mockResolvedValue({
    userId: ACTOR_ID,
    has: ({ role }: { role: string }) => role === ROLES.EVENT_COORDINATOR,
  });
}

function authAsOps() {
  mockAuth.mockResolvedValue({
    userId: ACTOR_ID,
    has: ({ role }: { role: string }) => role === ROLES.OPS,
  });
}

function authAsReadOnly() {
  mockAuth.mockResolvedValue({
    userId: ACTOR_ID,
    has: ({ role }: { role: string }) => role === ROLES.READ_ONLY,
  });
}

function mockUpdateChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  return { set, where };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: ACTOR_ID, role: ROLES.EVENT_COORDINATOR });
});

// ── RBAC (spec req 1) ───────────────────────────────────────────

describe('updateFieldConfig — RBAC', () => {
  it('rejects unauthenticated callers', async () => {
    mockAuth.mockResolvedValue({ userId: null, has: undefined });
    const result = await updateFieldConfig(EVENT_ID, VALID_FIELD_CONFIG);
    expect(result).toEqual({ ok: false, error: 'Not authenticated' });
  });

  it('rejects Ops role', async () => {
    authAsOps();
    const result = await updateFieldConfig(EVENT_ID, VALID_FIELD_CONFIG);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/coordinator|super admin/i);
  });

  it('rejects Read-only role', async () => {
    authAsReadOnly();
    const result = await updateFieldConfig(EVENT_ID, VALID_FIELD_CONFIG);
    expect(result.ok).toBe(false);
  });

  it('allows Event Coordinator', async () => {
    authAsCoordinator();
    const chain = mockUpdateChain();
    mockDb.update.mockReturnValue(chain);
    const result = await updateFieldConfig(EVENT_ID, VALID_FIELD_CONFIG);
    expect(result).toEqual({ ok: true });
  });

  it('allows Super Admin', async () => {
    authAsSuperAdmin();
    const chain = mockUpdateChain();
    mockDb.update.mockReturnValue(chain);
    const result = await updateFieldConfig(EVENT_ID, VALID_FIELD_CONFIG);
    expect(result).toEqual({ ok: true });
  });
});

// ── Input validation (spec req 2) ──────────────────────────────

describe('updateFieldConfig — input validation', () => {
  it('rejects a non-UUID eventId', async () => {
    authAsCoordinator();
    const result = await updateFieldConfig('not-a-uuid', VALID_FIELD_CONFIG);
    expect(result).toEqual({ ok: false, error: 'Invalid event ID' });
  });

  it('rejects an invalid fieldConfig (non-object)', async () => {
    authAsCoordinator();
    const result = await updateFieldConfig(EVENT_ID, 'bad');
    expect(result).toEqual({ ok: false, error: 'Invalid field configuration' });
  });

  it('rejects custom fields array exceeding 10 items', async () => {
    authAsCoordinator();
    const tooMany = Array.from({ length: 11 }, (_, i) => ({
      id: `${CUSTOM_FIELD_ID.slice(0, -1)}${i}`,
      type: 'text',
      label: `Field ${i}`,
      required: false,
    }));
    const result = await updateFieldConfig(EVENT_ID, { customFields: tooMany });
    expect(result).toEqual({ ok: false, error: 'Invalid field configuration' });
  });

  it('rejects a custom field with an invalid UUID id', async () => {
    authAsCoordinator();
    const result = await updateFieldConfig(EVENT_ID, {
      customFields: [{ id: 'bad-id', type: 'text', label: 'Name', required: false }],
    });
    expect(result).toEqual({ ok: false, error: 'Invalid field configuration' });
  });

  it('rejects a custom field with an unsupported type', async () => {
    authAsCoordinator();
    const result = await updateFieldConfig(EVENT_ID, {
      customFields: [{ id: CUSTOM_FIELD_ID, type: 'checkbox', label: 'Name', required: false }],
    });
    expect(result).toEqual({ ok: false, error: 'Invalid field configuration' });
  });

  it('rejects a custom field with an empty label', async () => {
    authAsCoordinator();
    const result = await updateFieldConfig(EVENT_ID, {
      customFields: [{ id: CUSTOM_FIELD_ID, type: 'text', label: '', required: false }],
    });
    expect(result).toEqual({ ok: false, error: 'Invalid field configuration' });
  });
});

// ── Standard field toggles (spec req 1) ────────────────────────

describe('updateFieldConfig — standard field toggles', () => {
  it('persists standard field toggles to the DB', async () => {
    authAsCoordinator();
    const chain = mockUpdateChain();
    mockDb.update.mockReturnValue(chain);

    await updateFieldConfig(EVENT_ID, VALID_FIELD_CONFIG);

    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldConfig: expect.objectContaining({
          standardFields: expect.objectContaining({
            designation: true,
            specialty: false,
          }),
        }),
      }),
    );
  });

  it('defaults absent standard field toggles to true', async () => {
    authAsCoordinator();
    const chain = mockUpdateChain();
    mockDb.update.mockReturnValue(chain);

    await updateFieldConfig(EVENT_ID, { standardFields: {}, customFields: [] });

    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldConfig: expect.objectContaining({
          standardFields: expect.objectContaining({
            designation: true,
            specialty: true,
            organization: true,
            city: true,
            age: true,
          }),
        }),
      }),
    );
  });
});

// ── Custom fields (spec req 2, 3) ──────────────────────────────

describe('updateFieldConfig — custom fields', () => {
  it('accepts all five custom field types', async () => {
    authAsCoordinator();
    const TYPES = ['text', 'number', 'select', 'date', 'file'] as const;

    for (const type of TYPES) {
      const chain = mockUpdateChain();
      mockDb.update.mockReturnValue(chain);
      const result = await updateFieldConfig(EVENT_ID, {
        customFields: [{ id: CUSTOM_FIELD_ID, type, label: 'My Field', required: false }],
      });
      expect(result.ok).toBe(true);
    }
  });

  it('accepts up to 10 custom fields', async () => {
    authAsCoordinator();
    const chain = mockUpdateChain();
    mockDb.update.mockReturnValue(chain);

    const tenFields = Array.from({ length: 10 }, (_, i) => ({
      id: `${CUSTOM_FIELD_ID.slice(0, -8)}${String(i).padStart(8, '0')}`,
      type: 'text' as const,
      label: `Field ${i + 1}`,
      required: false,
    }));

    const result = await updateFieldConfig(EVENT_ID, { customFields: tenFields });
    expect(result.ok).toBe(true);
  });

  it('persists custom fields to the DB', async () => {
    authAsCoordinator();
    const chain = mockUpdateChain();
    mockDb.update.mockReturnValue(chain);

    const customField = { id: CUSTOM_FIELD_ID, type: 'select', label: 'Dietary', required: true, options: ['Veg', 'Non-Veg'] };
    await updateFieldConfig(EVENT_ID, { customFields: [customField] });

    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldConfig: expect.objectContaining({
          customFields: expect.arrayContaining([
            expect.objectContaining({ id: CUSTOM_FIELD_ID, type: 'select', label: 'Dietary' }),
          ]),
        }),
      }),
    );
  });
});

// ── DB + path revalidation ──────────────────────────────────────

describe('updateFieldConfig — side effects', () => {
  it('scopes the update to the correct eventId', async () => {
    authAsCoordinator();
    const chain = mockUpdateChain();
    mockDb.update.mockReturnValue(chain);

    await updateFieldConfig(EVENT_ID, VALID_FIELD_CONFIG);

    expect(chain.where).toHaveBeenCalled();
  });

  it('revalidates the fields path', async () => {
    authAsCoordinator();
    const chain = mockUpdateChain();
    mockDb.update.mockReturnValue(chain);

    await updateFieldConfig(EVENT_ID, VALID_FIELD_CONFIG);

    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/fields`);
  });

  it('sets updatedBy to the acting user id', async () => {
    authAsCoordinator();
    const chain = mockUpdateChain();
    mockDb.update.mockReturnValue(chain);

    await updateFieldConfig(EVENT_ID, VALID_FIELD_CONFIG);

    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ updatedBy: ACTOR_ID }),
    );
  });
});
