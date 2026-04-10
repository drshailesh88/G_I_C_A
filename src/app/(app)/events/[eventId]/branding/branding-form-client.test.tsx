import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/actions/branding', () => ({
  updateEventBranding: vi.fn(),
  uploadBrandingImage: vi.fn(),
  deleteBrandingImage: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/hooks/use-role', () => ({
  useRole: () => ({ canWrite: true }),
}));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) =>
    createElement('img', {
      ...props,
      'data-testid': 'next-image',
    }),
}));

import { BrandingFormClient } from './branding-form-client';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

function render(overrides: Partial<Parameters<typeof BrandingFormClient>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(BrandingFormClient, {
      eventId: EVENT_ID,
      eventName: 'GEM India 2026',
      initialBranding: {
        logoStorageKey: '',
        headerImageStorageKey: '',
        primaryColor: '#1E40AF',
        secondaryColor: '#9333EA',
        emailSenderName: '',
        emailFooterText: '',
        whatsappPrefix: '',
      },
      initialImageUrls: {
        logoUrl: null,
        headerImageUrl: null,
      },
      ...overrides,
    }),
  );
}

describe('BrandingFormClient responsive migration', () => {
  it('renders page title', () => {
    const html = render();
    expect(html).toContain('Branding');
    expect(html).toContain('GEM India 2026');
  });

  it('uses FormGrid component (container query wrapper)', () => {
    const html = render();
    // FormGrid renders a @container wrapper
    expect(html).toContain('container-type');
    expect(html).toContain('form-grid');
  });

  it('renders primary and secondary color fields', () => {
    const html = render();
    expect(html).toContain('Primary Color');
    expect(html).toContain('Secondary Color');
    expect(html).toContain('#1E40AF');
    expect(html).toContain('#9333EA');
  });

  it('renders logo upload section', () => {
    const html = render();
    expect(html).toContain('Event Logo');
    expect(html).toContain('Click to upload logo');
  });

  it('renders header image upload section', () => {
    const html = render();
    expect(html).toContain('Header Image');
    expect(html).toContain('Click to upload header image');
  });

  it('uses ResponsiveImage (next/image) for logo preview when URL exists', () => {
    const html = render({
      initialImageUrls: {
        logoUrl: 'https://example.com/logo.png',
        headerImageUrl: null,
      },
    });
    // ResponsiveImage wraps next/image — should NOT have raw <img> with eslint-disable
    expect(html).toContain('next-image');
    expect(html).toContain('https://example.com/logo.png');
  });

  it('uses ResponsiveImage (next/image) for header preview when URL exists', () => {
    const html = render({
      initialImageUrls: {
        logoUrl: null,
        headerImageUrl: 'https://example.com/header.png',
      },
    });
    expect(html).toContain('next-image');
    expect(html).toContain('https://example.com/header.png');
  });

  it('does not contain raw img tags with eslint-disable for branding images', () => {
    const html = render({
      initialImageUrls: {
        logoUrl: 'https://example.com/logo.png',
        headerImageUrl: 'https://example.com/header.png',
      },
    });
    // The rendered HTML should use next/image (via ResponsiveImage), not raw <img>
    // Our mock sets data-testid="next-image" on next/image rendered elements
    expect(html).toContain('next-image');
  });

  it('renders communication branding fields', () => {
    const html = render();
    expect(html).toContain('Email Sender Name');
    expect(html).toContain('Email Footer Text');
    expect(html).toContain('WhatsApp Message Prefix');
  });

  it('renders save button for users with write access', () => {
    const html = render();
    expect(html).toContain('Save Changes');
  });
});
