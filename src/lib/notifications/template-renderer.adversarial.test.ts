import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbChain = {
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
};

mockDbChain.select.mockReturnValue(mockDbChain);
mockDbChain.from.mockReturnValue(mockDbChain);
mockDbChain.where.mockReturnValue(mockDbChain);
mockDbChain.limit.mockResolvedValue([]);

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => mockDbChain.select(...args),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  notificationTemplates: {
    eventId: 'eventId',
    channel: 'channel',
    templateKey: 'templateKey',
    status: 'status',
  },
  events: {
    id: 'id',
    branding: 'branding',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ op: 'eq', val })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  isNull: vi.fn((_col: unknown) => ({ op: 'isNull' })),
}));

vi.mock('@/lib/validations/branding', () => ({
  eventBrandingSchema: {
    safeParse: vi.fn((value: unknown) => ({ success: true, data: value })),
    parse: vi.fn((value: unknown) => value),
  },
  DEFAULT_BRANDING: {
    logoStorageKey: '',
    headerImageStorageKey: '',
    primaryColor: '#1E40AF',
    secondaryColor: '#9333EA',
    emailSenderName: '',
    emailFooterText: '',
    whatsappPrefix: '',
  },
}));

describe('template-renderer adversarial hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbChain.select.mockReturnValue(mockDbChain);
    mockDbChain.from.mockReturnValue(mockDbChain);
    mockDbChain.where.mockReturnValue(mockDbChain);
    mockDbChain.limit.mockResolvedValue([]);
  });

  it('rejects malformed event IDs before template queries run', async () => {
    const { resolveTemplate } = await import('./template-renderer');

    await expect(
      resolveTemplate('not-a-uuid', 'email', 'registration_confirmation'),
    ).rejects.toThrow('Invalid event ID');

    expect(mockDbChain.select).not.toHaveBeenCalled();
  });

  it('rejects malformed template keys before rendering queries run', async () => {
    const { renderTemplate } = await import('./template-renderer');

    await expect(
      renderTemplate({
        eventId: '11111111-1111-4111-8111-111111111111',
        channel: 'email',
        templateKey: '   ',
        variables: {},
      }),
    ).rejects.toThrow('Invalid template key');

    expect(mockDbChain.select).not.toHaveBeenCalled();
  });

  it('blocks cross-event branding asset signing', async () => {
    mockDbChain.limit.mockResolvedValueOnce([
      {
        branding: {
          logoStorageKey: 'branding/22222222-2222-4222-8222-222222222222/logo/private-logo.png',
          headerImageStorageKey: '',
          primaryColor: '#1E40AF',
          secondaryColor: '#9333EA',
          emailSenderName: 'GEM India',
          emailFooterText: '',
          whatsappPrefix: '',
        },
      },
    ]);

    const mockGetSignedUrl = vi.fn().mockResolvedValue('https://cdn.example.com/private-logo.png');
    const { loadEventBranding } = await import('./template-renderer');

    await expect(
      loadEventBranding(
        '11111111-1111-4111-8111-111111111111',
        'event_branding',
        null,
        mockGetSignedUrl,
      ),
    ).rejects.toThrow('Branding storageKey is outside the active event scope');

    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });
});
