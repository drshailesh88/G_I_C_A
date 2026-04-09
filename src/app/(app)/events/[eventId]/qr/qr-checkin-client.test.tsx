import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock dependencies
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

import { QrCheckInClient } from './qr-checkin-client';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

const emptyStats = { totalCheckedIn: 0, byMethod: {}, bySession: {} };
const sampleStats = {
  totalCheckedIn: 42,
  byMethod: { qr_scan: 30, manual_search: 12 },
  bySession: { 'session-1': 20, event_level: 22 },
};

function render(props: Partial<Parameters<typeof QrCheckInClient>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(QrCheckInClient, {
      eventId: EVENT_ID,
      initialStats: emptyStats,
      initialRecords: [],
      ...props,
    }),
  );
}

describe('QrCheckInClient', () => {
  it('renders the page title', () => {
    const html = render();
    expect(html).toContain('QR Check-In');
  });

  it('displays attendance stats cards', () => {
    const html = render({ initialStats: sampleStats });
    expect(html).toContain('42'); // total
    expect(html).toContain('30'); // qr scans
    expect(html).toContain('12'); // manual
    expect(html).toContain('2');  // sessions count
  });

  it('renders zero stats when no check-ins', () => {
    const html = render({ initialStats: emptyStats });
    expect(html).toContain('Total Checked In');
    expect(html).toContain('>0<'); // zero count
  });

  it('renders tab navigation with all three modes', () => {
    const html = render();
    expect(html).toContain('QR Scanner');
    expect(html).toContain('Manual Search');
    expect(html).toContain('Attendance Log');
  });

  it('renders QR scanner component in default mode', () => {
    const html = render();
    expect(html).toContain('data-testid="qr-scanner"');
    expect(html).toContain(`data-event="${EVENT_ID}"`);
  });

  it('renders Attendance Log tab even when scanner is active (tab always visible)', () => {
    // Default mode is 'scan', but the attendance log tab label is always present
    const html = render();
    expect(html).toContain('Attendance Log');
  });

  it('reflects stats from records passed to the component', () => {
    const html = render({
      initialStats: { totalCheckedIn: 5, byMethod: { qr_scan: 3, manual_search: 2 }, bySession: {} },
      initialRecords: [
        {
          id: 'att-1',
          personId: 'person-1',
          fullName: 'Dr. Sharma',
          registrationNumber: 'GEM-DEL-00001',
          category: 'delegate',
          sessionId: null,
          checkInMethod: 'qr_scan',
          checkInAt: new Date('2026-04-08T10:00:00Z'),
          checkInBy: 'user_123',
          offlineDeviceId: null,
          syncedAt: null,
        },
      ],
    });
    // Stats are always visible regardless of tab
    expect(html).toContain('>5<'); // total
    expect(html).toContain('>3<'); // qr scans
    expect(html).toContain('>2<'); // manual
  });
});
