import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScanFeedback } from './ScanFeedback';
import type { ScanLookupResult, ScanResultType } from '@/lib/attendance/qr-utils';

function render(result: ScanLookupResult | null, onDismiss?: () => void) {
  return renderToStaticMarkup(createElement(ScanFeedback, { result, onDismiss }));
}

describe('ScanFeedback', () => {
  it('renders nothing when result is null', () => {
    const html = render(null);
    expect(html).toBe('');
  });

  it('renders success feedback with person details', () => {
    const html = render({
      type: 'success',
      message: 'Check-in successful!',
      personName: 'Dr. Sharma',
      registrationNumber: 'GEM2026-DEL-00001',
      category: 'delegate',
    });
    expect(html).toContain('Check-in Successful');
    expect(html).toContain('Dr. Sharma');
    expect(html).toContain('GEM2026-DEL-00001');
    expect(html).toContain('delegate');
    expect(html).toContain('bg-green-50');
    expect(html).toContain('role="alert"');
  });

  it('renders duplicate feedback', () => {
    const html = render({
      type: 'duplicate',
      message: 'Already checked in for this event.',
      personName: 'Dr. Sharma',
      registrationNumber: 'GEM-DEL-00001',
      category: 'delegate',
    });
    expect(html).toContain('Already Checked In');
    expect(html).toContain('bg-yellow-50');
    expect(html).toContain('Already checked in');
  });

  it('renders invalid feedback without person details', () => {
    const html = render({
      type: 'invalid',
      message: 'QR code not recognized.',
    });
    expect(html).toContain('Invalid QR Code');
    expect(html).toContain('bg-red-50');
    expect(html).not.toContain('font-mono'); // no registration number
  });

  it('renders ineligible feedback', () => {
    const html = render({
      type: 'ineligible',
      message: 'Registration status "pending" is not eligible.',
      personName: 'Dr. Sharma',
      registrationNumber: 'GEM-DEL-00001',
      category: 'delegate',
    });
    expect(html).toContain('Not Eligible');
    expect(html).toContain('bg-orange-50');
    expect(html).toContain('pending');
  });

  it('includes aria-live for accessibility', () => {
    const html = render({ type: 'success', message: 'ok' });
    expect(html).toContain('aria-live="assertive"');
  });

  it('renders dismiss button when onDismiss provided', () => {
    const html = render({ type: 'success', message: 'ok' }, vi.fn());
    expect(html).toContain('Dismiss');
  });

  it('does not render dismiss button when onDismiss is undefined', () => {
    const html = render({ type: 'success', message: 'ok' });
    expect(html).not.toContain('Dismiss');
  });

  it('renders registration metadata even when personName is missing', () => {
    const html = render({
      type: 'duplicate',
      message: 'Already checked in for this event.',
      registrationNumber: 'GEM-DEL-00001',
      category: 'delegate',
    });
    expect(html).toContain('GEM-DEL-00001');
    expect(html).toContain('delegate');
  });

  it('covers all ScanResultType values', () => {
    const types: ScanResultType[] = ['success', 'duplicate', 'invalid', 'ineligible'];
    for (const type of types) {
      const html = render({ type, message: `Test ${type}` });
      expect(html.length).toBeGreaterThan(0);
    }
  });
});
