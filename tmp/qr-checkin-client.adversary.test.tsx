import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/components/shared/QrScanner', () => ({
  QrScanner: (props: any) => createElement('div', { 'data-testid': 'qr-scanner', 'data-event': props.eventId }),
}));
vi.mock('@/components/shared/ScanFeedback', () => ({
  ScanFeedback: (props: any) => props.result ? createElement('div', { 'data-testid': 'scan-feedback' }, props.result.message) : null,
}));
vi.mock('@/components/shared/CheckInSearch', () => ({
  CheckInSearch: (props: any) => createElement('div', { 'data-testid': 'check-in-search', 'data-event': props.eventId }),
}));
vi.mock('@/lib/hooks/use-online-status', () => ({
  useOnlineStatus: () => true,
}));

import { QrCheckInClient } from '@/app/(app)/events/[eventId]/qr/qr-checkin-client';

afterEach(() => {
  vi.restoreAllMocks();
});

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

function render(props: Partial<Parameters<typeof QrCheckInClient>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(QrCheckInClient, {
      eventId: EVENT_ID,
      initialStats: { totalCheckedIn: 0, byMethod: {}, bySession: {} },
      initialRecords: [],
      totalRegistrations: 100,
      ...props,
    }),
  );
}

describe('QrCheckInClient adversarial findings', () => {
  it('exposes the Manual Check-in toggle state with aria-pressed for assistive tech', () => {
    const html = render();
    expect(html).toContain('aria-pressed="false"');
  });

  it('announces connectivity changes through a live status region', () => {
    const html = render();
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it('formats recent check-in timestamps explicitly in IST', () => {
    const timeSpy = vi
      .spyOn(Date.prototype, 'toLocaleTimeString')
      .mockReturnValue('03:30 pm');

    render({
      initialRecords: [
        {
          id: 'att-ist',
          personId: 'person-ist',
          fullName: 'Dr. Iyer',
          registrationNumber: 'GEM-DEL-00077',
          category: 'delegate',
          sessionId: null,
          checkInMethod: 'manual_search',
          checkInAt: new Date('2026-04-08T10:00:00Z'),
          checkInBy: 'user_123',
          offlineDeviceId: null,
          syncedAt: null,
        },
      ],
    });

    expect(timeSpy).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      }),
    );
  });
});
