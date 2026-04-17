/**
 * Mutation-killing tests for template-renderer.ts
 *
 * Targets: 21 survivors — ConditionalExpression, StringLiteral,
 * LogicalOperator, ObjectLiteral, BlockStatement in resolveTemplate,
 * loadEventBranding, renderTemplate.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB and schema
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
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
  eq: vi.fn((...args: any[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
  isNull: vi.fn((col: any) => ({ type: 'isNull', col })),
}));
vi.mock('@/lib/validations/branding', () => ({
  eventBrandingSchema: {
    safeParse: vi.fn().mockReturnValue({
      success: true,
      data: {
        primaryColor: '#1E40AF',
        secondaryColor: '#9333EA',
        emailSenderName: 'GEM India',
        emailFooterText: 'Footer',
        whatsappPrefix: '',
        logoStorageKey: null,
        headerImageStorageKey: null,
      },
    }),
    parse: vi.fn().mockReturnValue({
      primaryColor: '#000000',
      secondaryColor: '#FFFFFF',
      emailSenderName: 'Default',
      emailFooterText: '',
      whatsappPrefix: '',
      logoStorageKey: null,
      headerImageStorageKey: null,
    }),
  },
  DEFAULT_BRANDING: {
    primaryColor: '#000000',
    secondaryColor: '#FFFFFF',
    emailSenderName: 'Default',
    emailFooterText: '',
    whatsappPrefix: '',
    logoStorageKey: null,
    headerImageStorageKey: null,
  },
}));
vi.mock('./template-utils', () => ({
  interpolate: vi.fn((content: string) => content),
  validateRequiredVariables: vi.fn(() => []),
}));

import { db } from '@/lib/db';
import { eventBrandingSchema, DEFAULT_BRANDING } from '@/lib/validations/branding';
import { interpolate, validateRequiredVariables } from './template-utils';

describe('resolveTemplate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns event-specific template when found', async () => {
    const mockTemplate = {
      id: 'tpl-1',
      eventId: '11111111-1111-4111-8111-111111111111',
      channel: 'email',
      templateKey: 'welcome',
      status: 'active',
      bodyContent: 'Hello',
    };

    (db.limit as any).mockResolvedValueOnce([mockTemplate]);

    const { resolveTemplate } = await import('./template-renderer');
    const result = await resolveTemplate('11111111-1111-4111-8111-111111111111', 'email', 'welcome');
    expect(result).toEqual(mockTemplate);
  });

  it('falls back to global template when event-specific not found', async () => {
    const globalTemplate = {
      id: 'tpl-global',
      eventId: null,
      channel: 'email',
      templateKey: 'welcome',
      status: 'active',
      bodyContent: 'Global Hello',
    };

    (db.limit as any)
      .mockResolvedValueOnce([]) // no event template
      .mockResolvedValueOnce([globalTemplate]); // global found

    const { resolveTemplate } = await import('./template-renderer');
    const result = await resolveTemplate('11111111-1111-4111-8111-111111111111', 'email', 'welcome');
    expect(result).toEqual(globalTemplate);
  });

  it('returns null when neither event-specific nor global template found', async () => {
    (db.limit as any)
      .mockResolvedValueOnce([]) // no event template
      .mockResolvedValueOnce([]); // no global template

    const { resolveTemplate } = await import('./template-renderer');
    const result = await resolveTemplate('11111111-1111-4111-8111-111111111111', 'email', 'welcome');
    expect(result).toBeNull();
  });
});

describe('loadEventBranding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses custom branding when brandingMode is custom', async () => {
    const customBranding = { primaryColor: '#FF0000' };
    (eventBrandingSchema.safeParse as any).mockReturnValue({
      success: true,
      data: {
        primaryColor: '#FF0000',
        secondaryColor: '#9333EA',
        emailSenderName: 'Custom',
        emailFooterText: 'Custom footer',
        whatsappPrefix: '[CUSTOM]',
        logoStorageKey: null,
        headerImageStorageKey: null,
      },
    });

    const { loadEventBranding } = await import('./template-renderer');
    const result = await loadEventBranding('11111111-1111-4111-8111-111111111111', 'custom', customBranding);

    expect(result.primaryColor).toBe('#FF0000');
    expect(result.emailSenderName).toBe('Custom');
    expect(result.logoUrl).toBe('');
    expect(result.headerImageUrl).toBe('');
  });

  it('uses defaults when custom brandingMode with null customBrandingJson', async () => {
    (eventBrandingSchema.safeParse as any).mockReturnValue({
      success: true,
      data: {
        ...DEFAULT_BRANDING,
        emailSenderName: 'Default',
        logoStorageKey: null,
        headerImageStorageKey: null,
      },
    });

    const { loadEventBranding } = await import('./template-renderer');
    const result = await loadEventBranding('11111111-1111-4111-8111-111111111111', 'custom', null);

    // Should call safeParse with merged defaults (not crash on null)
    expect(eventBrandingSchema.safeParse).toHaveBeenCalled();
    expect(result.logoUrl).toBe('');
    expect(result.headerImageUrl).toBe('');
  });

  it('loads event branding from DB when brandingMode is not custom', async () => {
    const eventBranding = {
      primaryColor: '#123456',
      secondaryColor: '#654321',
      emailSenderName: 'Event Org',
      emailFooterText: 'Event footer',
      whatsappPrefix: '',
      logoStorageKey: null,
      headerImageStorageKey: null,
    };

    (db.limit as any).mockResolvedValueOnce([{ branding: eventBranding }]);
    (eventBrandingSchema.safeParse as any).mockReturnValue({
      success: true,
      data: eventBranding,
    });

    const { loadEventBranding } = await import('./template-renderer');
    const result = await loadEventBranding('11111111-1111-4111-8111-111111111111', 'default', null);

    expect(result.primaryColor).toBe('#123456');
    expect(result.emailSenderName).toBe('Event Org');
  });

  it('throws when event not found in default brandingMode', async () => {
    (db.limit as any).mockResolvedValueOnce([]); // no event

    const { loadEventBranding } = await import('./template-renderer');
    await expect(
      loadEventBranding('99999999-9999-4999-8999-999999999999', 'default', null),
    ).rejects.toThrow('Event not found: 99999999-9999-4999-8999-999999999999');
  });

  it('resolves logo and header image URLs via getSignedUrlFn', async () => {
    const brandingWithImages = {
      primaryColor: '#1E40AF',
      secondaryColor: '#9333EA',
      emailSenderName: 'GEM India',
      emailFooterText: '',
      whatsappPrefix: '',
      logoStorageKey: 'branding/11111111-1111-4111-8111-111111111111/logo/logo.png',
      headerImageStorageKey: 'branding/11111111-1111-4111-8111-111111111111/header/header.jpg',
    };

    (db.limit as any).mockResolvedValueOnce([{ branding: brandingWithImages }]);
    (eventBrandingSchema.safeParse as any).mockReturnValue({
      success: true,
      data: brandingWithImages,
    });

    const mockGetSignedUrl = vi.fn()
      .mockResolvedValueOnce('https://cdn.example.com/logo.png')
      .mockResolvedValueOnce('https://cdn.example.com/header.jpg');

    const { loadEventBranding } = await import('./template-renderer');
    const result = await loadEventBranding('11111111-1111-4111-8111-111111111111', 'default', null, mockGetSignedUrl);

    expect(result.logoUrl).toBe('https://cdn.example.com/logo.png');
    expect(result.headerImageUrl).toBe('https://cdn.example.com/header.jpg');
    expect(mockGetSignedUrl).toHaveBeenCalledWith('branding/11111111-1111-4111-8111-111111111111/logo/logo.png', 3600);
    expect(mockGetSignedUrl).toHaveBeenCalledWith('branding/11111111-1111-4111-8111-111111111111/header/header.jpg', 3600);
  });

  it('resolves only logo when headerImageStorageKey is null', async () => {
    const branding = {
      primaryColor: '#1E40AF',
      secondaryColor: '#9333EA',
      emailSenderName: 'GEM',
      emailFooterText: '',
      whatsappPrefix: '',
      logoStorageKey: 'branding/11111111-1111-4111-8111-111111111111/logo/logo.png',
      headerImageStorageKey: null,
    };

    (db.limit as any).mockResolvedValueOnce([{ branding }]);
    (eventBrandingSchema.safeParse as any).mockReturnValue({ success: true, data: branding });

    const mockGetSignedUrl = vi.fn().mockResolvedValueOnce('https://cdn.example.com/logo.png');

    const { loadEventBranding } = await import('./template-renderer');
    const result = await loadEventBranding('11111111-1111-4111-8111-111111111111', 'default', null, mockGetSignedUrl);

    expect(result.logoUrl).toBe('https://cdn.example.com/logo.png');
    expect(result.headerImageUrl).toBe('');
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('falls back to defaults when safeParse fails', async () => {
    (db.limit as any).mockResolvedValueOnce([{ branding: { invalidKey: 'bad' } }]);
    (eventBrandingSchema.safeParse as any).mockReturnValue({ success: false, error: new Error('bad') });
    (eventBrandingSchema.parse as any).mockReturnValue({
      ...DEFAULT_BRANDING,
      logoStorageKey: null,
      headerImageStorageKey: null,
    });

    const { loadEventBranding } = await import('./template-renderer');
    const result = await loadEventBranding('11111111-1111-4111-8111-111111111111', 'default', null);

    expect(eventBrandingSchema.parse).toHaveBeenCalledWith(DEFAULT_BRANDING);
    expect(result).toBeDefined();
  });

  it('sanitizes emailSenderName to prevent CRLF injection', async () => {
    const branding = {
      primaryColor: '#1E40AF',
      secondaryColor: '#9333EA',
      emailSenderName: 'GEM\r\nBcc: attacker@evil.com',
      emailFooterText: '',
      whatsappPrefix: '',
      logoStorageKey: null,
      headerImageStorageKey: null,
    };

    (db.limit as any).mockResolvedValueOnce([{ branding }]);
    (eventBrandingSchema.safeParse as any).mockReturnValue({ success: true, data: branding });

    const { loadEventBranding } = await import('./template-renderer');
    const result = await loadEventBranding('11111111-1111-4111-8111-111111111111', 'default', null);

    expect(result.emailSenderName).not.toContain('\r');
    expect(result.emailSenderName).not.toContain('\n');
    expect(result.emailSenderName).toContain('GEM');
  });
});

describe('renderTemplate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when no template is found', async () => {
    (db.limit as any)
      .mockResolvedValueOnce([]) // no event template
      .mockResolvedValueOnce([]); // no global template

    const { renderTemplate } = await import('./template-renderer');
    await expect(
      renderTemplate({
        eventId: '11111111-1111-4111-8111-111111111111',
        channel: 'email',
        templateKey: 'nonexistent',
        variables: {},
      }),
    ).rejects.toThrow('No active template found');
  });

  it('throws error containing template key, channel, and eventId', async () => {
    (db.limit as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { renderTemplate } = await import('./template-renderer');
    await expect(
      renderTemplate({
        eventId: '99999999-9999-4999-8999-999999999998',
        channel: 'whatsapp',
        templateKey: 'missing_key',
        variables: {},
      }),
    ).rejects.toThrow(/missing_key.*whatsapp.*99999999-9999-4999-8999-999999999998/);
  });

  it('throws when required variables are missing', async () => {
    const template = {
      id: 'tpl-1',
      versionNo: 1,
      bodyContent: 'Hello {{name}}',
      subjectLine: 'Welcome',
      brandingMode: 'default',
      customBrandingJson: null,
      requiredVariablesJson: ['name', 'email'],
    };

    (db.limit as any)
      .mockResolvedValueOnce([template]) // event template found
      .mockResolvedValueOnce([{ branding: {} }]); // event row for branding

    (eventBrandingSchema.safeParse as any).mockReturnValue({
      success: true,
      data: {
        ...DEFAULT_BRANDING,
        emailSenderName: 'GEM',
        logoStorageKey: null,
        headerImageStorageKey: null,
      },
    });

    // Return missing variables
    (validateRequiredVariables as any).mockReturnValue(['email']);

    const { renderTemplate } = await import('./template-renderer');
    await expect(
      renderTemplate({
        eventId: '11111111-1111-4111-8111-111111111111',
        channel: 'email',
        templateKey: 'welcome',
        variables: { name: 'Alice' },
      }),
    ).rejects.toThrow('Missing required template variables: email');
  });

  it('prepends whatsappPrefix for whatsapp channel', async () => {
    const template = {
      id: 'tpl-1',
      versionNo: 1,
      bodyContent: 'Your appointment is confirmed',
      subjectLine: null,
      brandingMode: 'default',
      customBrandingJson: null,
      requiredVariablesJson: [],
    };

    (db.limit as any)
      .mockResolvedValueOnce([template])
      .mockResolvedValueOnce([{ branding: {} }]);

    (eventBrandingSchema.safeParse as any).mockReturnValue({
      success: true,
      data: {
        ...DEFAULT_BRANDING,
        emailSenderName: 'GEM',
        whatsappPrefix: '*GEM India*',
        logoStorageKey: null,
        headerImageStorageKey: null,
      },
    });

    (validateRequiredVariables as any).mockReturnValue([]);
    (interpolate as any).mockImplementation((content: string) => content);

    const { renderTemplate } = await import('./template-renderer');
    const result = await renderTemplate({
      eventId: '11111111-1111-4111-8111-111111111111',
      channel: 'whatsapp',
      templateKey: 'reminder',
      variables: {},
    });

    expect(result.body).toContain('*GEM India*');
    expect(result.body).toContain('Your appointment is confirmed');
  });

  it('does not prepend whatsappPrefix for email channel', async () => {
    const template = {
      id: 'tpl-1',
      versionNo: 1,
      bodyContent: '<p>Hello</p>',
      subjectLine: 'Subject',
      brandingMode: 'default',
      customBrandingJson: null,
      requiredVariablesJson: [],
    };

    (db.limit as any)
      .mockResolvedValueOnce([template])
      .mockResolvedValueOnce([{ branding: {} }]);

    (eventBrandingSchema.safeParse as any).mockReturnValue({
      success: true,
      data: {
        ...DEFAULT_BRANDING,
        emailSenderName: 'GEM',
        whatsappPrefix: '*GEM India*',
        logoStorageKey: null,
        headerImageStorageKey: null,
      },
    });

    (validateRequiredVariables as any).mockReturnValue([]);
    (interpolate as any).mockImplementation((content: string) => content);

    const { renderTemplate } = await import('./template-renderer');
    const result = await renderTemplate({
      eventId: '11111111-1111-4111-8111-111111111111',
      channel: 'email',
      templateKey: 'welcome',
      variables: {},
    });

    expect(result.body).not.toContain('*GEM India*');
    expect(result.subject).toBe('Subject');
  });

  it('returns null subject when template has no subjectLine', async () => {
    const template = {
      id: 'tpl-1',
      versionNo: 1,
      bodyContent: 'Body text',
      subjectLine: null,
      brandingMode: 'default',
      customBrandingJson: null,
      requiredVariablesJson: [],
    };

    (db.limit as any)
      .mockResolvedValueOnce([template])
      .mockResolvedValueOnce([{ branding: {} }]);

    (eventBrandingSchema.safeParse as any).mockReturnValue({
      success: true,
      data: {
        ...DEFAULT_BRANDING,
        emailSenderName: 'GEM',
        whatsappPrefix: '',
        logoStorageKey: null,
        headerImageStorageKey: null,
      },
    });

    (validateRequiredVariables as any).mockReturnValue([]);
    (interpolate as any).mockImplementation((content: string) => content);

    const { renderTemplate } = await import('./template-renderer');
    const result = await renderTemplate({
      eventId: '11111111-1111-4111-8111-111111111111',
      channel: 'email',
      templateKey: 'welcome',
      variables: {},
    });

    expect(result.subject).toBeNull();
    expect(result.templateId).toBe('tpl-1');
    expect(result.templateVersionNo).toBe(1);
  });
});
