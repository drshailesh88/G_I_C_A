import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/actions/registration', () => ({
  registerForEvent: vi.fn(),
}));

vi.mock('lucide-react', () => ({
  Loader2: () => createElement('span', { 'data-testid': 'loader' }),
}));

vi.mock('@/components/responsive/form-grid', () => ({
  FormGrid: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
}));

import { RegisterPageClient } from './register-page-client';

const baseProps = {
  eventId: '550e8400-e29b-41d4-a716-446655440099',
  eventName: 'GEM India 2026',
  startDate: '2026-04-20T00:00:00.000Z',
  endDate: '2026-04-22T00:00:00.000Z',
  venueName: 'AIIMS Delhi',
  registrationOpen: true,
};

describe('RegisterPageClient', () => {
  it('renders Register heading', () => {
    const html = renderToStaticMarkup(createElement(RegisterPageClient, baseProps));
    expect(html).toContain('<h1');
    expect(html).toContain('Register</h1>');
  });

  it('renders core person fields (fullName, email, phone, city, organization)', () => {
    const html = renderToStaticMarkup(createElement(RegisterPageClient, baseProps));
    expect(html).toContain('Full Name');
    expect(html).toContain('Email');
    expect(html).toContain('Mobile Number');
    expect(html).toContain('City');
    expect(html).toContain('Organization');
  });

  it('registration closed event — form disabled with Registration closed message', () => {
    const html = renderToStaticMarkup(
      createElement(RegisterPageClient, { ...baseProps, registrationOpen: false }),
    );
    expect(html).toContain('Registration closed');
    expect(html).toContain('<fieldset disabled=""');
  });

  it('shows event name and venue', () => {
    const html = renderToStaticMarkup(createElement(RegisterPageClient, baseProps));
    expect(html).toContain('GEM India 2026');
    expect(html).toContain('AIIMS Delhi');
  });

  it('links the registration footer to /terms', () => {
    const html = renderToStaticMarkup(createElement(RegisterPageClient, baseProps));
    expect(html).toContain('Terms &amp; Privacy Policy');
    expect(html).toContain('href="/terms"');
  });
});
