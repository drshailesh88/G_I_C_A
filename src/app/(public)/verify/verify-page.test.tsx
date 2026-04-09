import { describe, expect, it, vi } from 'vitest';
import { createElement, Suspense } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock dependencies
const mockSearchParams = { get: vi.fn().mockReturnValue(null) };
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));
vi.mock('@/lib/actions/certificate-issuance', () => ({
  verifyCertificate: vi.fn(),
}));

// Since the page uses Suspense + useSearchParams, we test the inner component
// by importing directly after mocks
import VerifyCertificatePage from './page';

function render() {
  // Wrap in Suspense for SSR
  return renderToStaticMarkup(
    createElement(Suspense, { fallback: createElement('div', null, 'Loading') },
      createElement(VerifyCertificatePage),
    ),
  );
}

describe('VerifyCertificatePage', () => {
  it('renders the verification page title', () => {
    const html = render();
    expect(html).toContain('Certificate Verification');
  });

  it('renders the verification code input', () => {
    const html = render();
    expect(html).toContain('Verification Code');
    expect(html).toContain('verify-token');
  });

  it('renders the verify button', () => {
    const html = render();
    expect(html).toContain('Verify');
  });

  it('renders the GEM India footer', () => {
    const html = render();
    expect(html).toContain('GEM India Conference Management Platform');
  });

  it('renders with shield icon', () => {
    const html = render();
    expect(html).toContain('bg-blue-100');
    expect(html).toContain('svg');
  });

  it('renders input placeholder with UUID hint', () => {
    const html = render();
    expect(html).toContain('UUID from the certificate QR code');
  });

  it('pre-fills token from URL search params', () => {
    mockSearchParams.get.mockReturnValue('abc-test-token');
    const html = render();
    expect(html).toContain('abc-test-token');
    mockSearchParams.get.mockReturnValue(null);
  });
});
