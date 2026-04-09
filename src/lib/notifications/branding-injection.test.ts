/**
 * Tests for 6B-2: Branding injection into notification templates
 *
 * Verifies that renderTemplate() loads event branding and injects
 * branding variables into templates before interpolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────

// Track what the DB select().from() chain returns
const mockDbChain = {
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
};

// By default, resolveTemplate returns a template, loadEventBranding returns branding
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
  notificationTemplates: { eventId: 'event_id', channel: 'channel', templateKey: 'template_key', status: 'status' },
  events: { id: 'id', branding: 'branding' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ op: 'eq', val })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  isNull: vi.fn((_col: unknown) => ({ op: 'isNull' })),
}));

vi.mock('@/lib/certificates/storage', () => ({
  createR2Provider: vi.fn(),
}));

import { renderTemplate, loadEventBranding } from './template-renderer';

// ── Helpers ────────────────────────────────────────────────────

function makeTemplate(overrides?: Record<string, unknown>) {
  return {
    id: 'tpl-1',
    eventId: 'evt-1',
    templateKey: 'registration_confirmation',
    channel: 'email',
    templateName: 'Registration Confirmation',
    metaCategory: 'registration',
    status: 'active',
    versionNo: 1,
    subjectLine: 'Welcome to {{eventName}}',
    bodyContent: '<div style="background:{{branding.primaryColor}}"><img src="{{branding.logoUrl}}" /><p>Hello {{fullName}}</p><footer>{{branding.emailFooterText}}</footer></div>',
    requiredVariablesJson: ['fullName', 'eventName'],
    allowedVariablesJson: [],
    brandingMode: 'event_branding',
    customBrandingJson: null,
    previewText: null,
    whatsappTemplateName: null,
    whatsappLanguageCode: null,
    isSystemTemplate: true,
    notes: null,
    lastActivatedAt: null,
    triggerType: 'registration.created',
    sendMode: 'automatic',
    createdBy: 'system',
    updatedBy: 'system',
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    ...overrides,
  };
}

function makeEventRow(branding: Record<string, unknown> = {}) {
  return { branding };
}

/** Track call index to return different results for template vs event queries */
let dbCallIndex = 0;

function setupDbReturns(templateResult: unknown[], eventResult: unknown[]) {
  dbCallIndex = 0;
  mockDbChain.limit.mockImplementation(() => {
    const idx = dbCallIndex++;
    // First two calls are for resolveTemplate (event override + global fallback)
    // Next call is for loadEventBranding (events table)
    if (idx === 0) return Promise.resolve(templateResult);
    if (idx === 1) return Promise.resolve(templateResult.length > 0 ? [] : []);
    return Promise.resolve(eventResult);
  });
}

function setupDbReturnsSequence(results: unknown[][]) {
  dbCallIndex = 0;
  mockDbChain.limit.mockImplementation(() => {
    const result = results[dbCallIndex] ?? [];
    dbCallIndex++;
    return Promise.resolve(result);
  });
}

const mockGetSignedUrl = vi.fn().mockImplementation(
  (key: string) => Promise.resolve(`https://r2.example.com/signed/${key}`),
);

beforeEach(() => {
  vi.clearAllMocks();
  dbCallIndex = 0;
  mockDbChain.select.mockReturnValue(mockDbChain);
  mockDbChain.from.mockReturnValue(mockDbChain);
  mockDbChain.where.mockReturnValue(mockDbChain);
  mockDbChain.limit.mockResolvedValue([]);
  mockGetSignedUrl.mockClear();
});

// ── Tests ──────────────────────────────────────────────────────

describe('renderTemplate with branding injection', () => {
  it('injects custom branding colors and logo URL into rendered template', async () => {
    const template = makeTemplate();
    const eventBranding = makeEventRow({
      logoStorageKey: 'branding/evt-1/logo/abc-logo.png',
      primaryColor: '#FF0000',
      secondaryColor: '#00FF00',
      emailSenderName: 'GEM Conference',
      emailFooterText: 'Powered by GEM India',
    });

    // Call sequence: resolveTemplate event-specific (found → returns early), loadEventBranding
    setupDbReturnsSequence([
      [template],        // resolveTemplate: event-specific match → returns immediately
      [eventBranding],   // loadEventBranding: event branding
    ]);

    const result = await renderTemplate(
      {
        eventId: 'evt-1',
        channel: 'email',
        templateKey: 'registration_confirmation',
        variables: { fullName: 'Dr. Sharma', eventName: 'GEM 2026' },
      },
      { getSignedUrlFn: mockGetSignedUrl },
    );

    // Logo URL should be resolved via getSignedUrlFn
    expect(mockGetSignedUrl).toHaveBeenCalledWith('branding/evt-1/logo/abc-logo.png', 3600);

    // Body should contain the injected branding values
    expect(result.body).toContain('#FF0000'); // primaryColor
    expect(result.body).toContain('https://r2.example.com/signed/branding/evt-1/logo/abc-logo.png'); // logo URL
    expect(result.body).toContain('Powered by GEM India'); // footer
    expect(result.body).toContain('Dr. Sharma'); // regular variable still works

    // Subject should also have regular variables interpolated
    expect(result.subject).toBe('Welcome to GEM 2026');

    // brandingVars should be returned for the send layer
    expect(result.brandingVars.emailSenderName).toBe('GEM Conference');
    expect(result.brandingVars.primaryColor).toBe('#FF0000');
  });

  it('uses defaults when event has no branding configured', async () => {
    const template = makeTemplate({
      bodyContent: '<div style="color:{{branding.primaryColor}}"><p>{{fullName}}</p></div>',
    });
    const eventWithNoBranding = makeEventRow({}); // empty branding

    setupDbReturnsSequence([
      [template],
      [eventWithNoBranding],
    ]);

    const result = await renderTemplate(
      {
        eventId: 'evt-1',
        channel: 'email',
        templateKey: 'registration_confirmation',
        variables: { fullName: 'Alice', eventName: 'Test Event' },
      },
      { getSignedUrlFn: mockGetSignedUrl },
    );

    // Default primary color should be injected
    expect(result.body).toContain('#1E40AF');
    expect(result.brandingVars.primaryColor).toBe('#1E40AF');
    expect(result.brandingVars.secondaryColor).toBe('#9333EA');

    // No logo → no signed URL call, empty string
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
    expect(result.brandingVars.logoUrl).toBe('');
  });

  it('applies updated branding when event branding changes', async () => {
    const template = makeTemplate({
      bodyContent: '<p style="color:{{branding.primaryColor}}">{{fullName}} — {{branding.emailFooterText}}</p>',
    });

    // First render: original branding
    const originalBranding = makeEventRow({
      primaryColor: '#111111',
      emailFooterText: 'Old Footer',
    });

    setupDbReturnsSequence([
      [template],
      [originalBranding],
    ]);

    const result1 = await renderTemplate(
      {
        eventId: 'evt-1',
        channel: 'email',
        templateKey: 'registration_confirmation',
        variables: { fullName: 'Bob', eventName: 'Event' },
      },
      { getSignedUrlFn: mockGetSignedUrl },
    );

    expect(result1.body).toContain('#111111');
    expect(result1.body).toContain('Old Footer');

    // Second render: updated branding
    const updatedBranding = makeEventRow({
      primaryColor: '#222222',
      emailFooterText: 'New Footer',
    });

    setupDbReturnsSequence([
      [template],
      [updatedBranding],
    ]);

    const result2 = await renderTemplate(
      {
        eventId: 'evt-1',
        channel: 'email',
        templateKey: 'registration_confirmation',
        variables: { fullName: 'Bob', eventName: 'Event' },
      },
      { getSignedUrlFn: mockGetSignedUrl },
    );

    expect(result2.body).toContain('#222222');
    expect(result2.body).toContain('New Footer');
    expect(result2.body).not.toContain('#111111');
    expect(result2.body).not.toContain('Old Footer');
  });

  it('prepends whatsappPrefix to WhatsApp messages', async () => {
    const template = makeTemplate({
      channel: 'whatsapp',
      subjectLine: null,
      bodyContent: 'Hello {{fullName}}, your registration is confirmed.',
    });

    const eventBranding = makeEventRow({
      whatsappPrefix: '*GEM India 2026*',
    });

    setupDbReturnsSequence([
      [template],
      [eventBranding],
    ]);

    const result = await renderTemplate(
      {
        eventId: 'evt-1',
        channel: 'whatsapp',
        templateKey: 'registration_confirmation',
        variables: { fullName: 'Dr. Patel', eventName: 'GEM 2026' },
      },
      { getSignedUrlFn: mockGetSignedUrl },
    );

    expect(result.body).toBe('*GEM India 2026*\n\nHello Dr. Patel, your registration is confirmed.');
    expect(result.brandingVars.whatsappPrefix).toBe('*GEM India 2026*');
  });

  it('does not prepend whatsappPrefix to email templates', async () => {
    const template = makeTemplate({
      bodyContent: '<p>Hello {{fullName}}</p>',
    });

    const eventBranding = makeEventRow({
      whatsappPrefix: '*GEM India*',
    });

    setupDbReturnsSequence([
      [template],
      [eventBranding],
    ]);

    const result = await renderTemplate(
      {
        eventId: 'evt-1',
        channel: 'email',
        templateKey: 'registration_confirmation',
        variables: { fullName: 'Alice', eventName: 'Test' },
      },
      { getSignedUrlFn: mockGetSignedUrl },
    );

    // Email should NOT have whatsappPrefix prepended
    expect(result.body).toBe('<p>Hello Alice</p>');
    expect(result.body).not.toContain('*GEM India*');
  });

  it('uses custom branding from template when brandingMode is "custom"', async () => {
    const customBranding = {
      primaryColor: '#AABBCC',
      emailSenderName: 'Custom Sender',
      logoStorageKey: 'custom/logo.png',
    };

    const template = makeTemplate({
      brandingMode: 'custom',
      customBrandingJson: customBranding,
      bodyContent: '<p style="color:{{branding.primaryColor}}">{{fullName}}</p>',
    });

    // With custom branding, the events table should NOT be queried for branding
    setupDbReturnsSequence([
      [template],
      // No second call needed — custom branding doesn't query events table
    ]);

    const result = await renderTemplate(
      {
        eventId: 'evt-1',
        channel: 'email',
        templateKey: 'registration_confirmation',
        variables: { fullName: 'Charlie', eventName: 'Event' },
      },
      { getSignedUrlFn: mockGetSignedUrl },
    );

    expect(result.body).toContain('#AABBCC');
    expect(result.brandingVars.emailSenderName).toBe('Custom Sender');
    expect(mockGetSignedUrl).toHaveBeenCalledWith('custom/logo.png', 3600);
  });
});

describe('loadEventBranding', () => {
  it('resolves both logo and header image URLs when storage keys exist', async () => {
    const eventRow = makeEventRow({
      logoStorageKey: 'branding/evt-1/logo/logo.png',
      headerImageStorageKey: 'branding/evt-1/header/banner.jpg',
      primaryColor: '#ABCDEF',
    });

    setupDbReturnsSequence([[eventRow]]);

    const vars = await loadEventBranding('evt-1', 'event_branding', null, mockGetSignedUrl);

    expect(mockGetSignedUrl).toHaveBeenCalledTimes(2);
    expect(mockGetSignedUrl).toHaveBeenCalledWith('branding/evt-1/logo/logo.png', 3600);
    expect(mockGetSignedUrl).toHaveBeenCalledWith('branding/evt-1/header/banner.jpg', 3600);
    expect(vars.logoUrl).toBe('https://r2.example.com/signed/branding/evt-1/logo/logo.png');
    expect(vars.headerImageUrl).toBe('https://r2.example.com/signed/branding/evt-1/header/banner.jpg');
    expect(vars.primaryColor).toBe('#ABCDEF');
  });
});

describe('sendNotification passes fromDisplayName from branding', () => {
  // This is tested via the send.test.ts integration, but we verify the
  // brandingVars are returned correctly from renderTemplate for the send layer
  it('returns brandingVars.emailSenderName for the send layer to use', async () => {
    const template = makeTemplate({
      bodyContent: '<p>{{fullName}}</p>',
    });

    const eventBranding = makeEventRow({
      emailSenderName: 'Dr. Gupta Conference',
    });

    setupDbReturnsSequence([
      [template],
      [eventBranding],
    ]);

    const result = await renderTemplate(
      {
        eventId: 'evt-1',
        channel: 'email',
        templateKey: 'registration_confirmation',
        variables: { fullName: 'Test', eventName: 'Event' },
      },
      { getSignedUrlFn: mockGetSignedUrl },
    );

    expect(result.brandingVars.emailSenderName).toBe('Dr. Gupta Conference');
  });
});
