import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/actions/certificate-generation', () => ({
  getEligibleRecipients: vi.fn().mockResolvedValue([]),
  bulkGenerateCertificates: vi.fn().mockResolvedValue({
    issued: 0, skipped: 0, certificateIds: [], errors: [],
  }),
  sendCertificateNotifications: vi.fn().mockResolvedValue({ sent: 0, failed: 0 }),
  RECIPIENT_TYPES: ['all_delegates', 'all_faculty', 'all_attendees', 'custom'],
}));
vi.mock('@/lib/actions/certificate-bulk-zip', () => ({
  bulkZipDownload: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    createElement('a', { href }, children),
}));

import { GenerationClient } from './generation-client';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeTemplate(overrides: Partial<Parameters<typeof GenerationClient>[0]['activeTemplates'][0]> = {}) {
  return {
    id: 'tpl-1',
    templateName: 'Delegate Attendance',
    certificateType: 'delegate_attendance',
    audienceScope: 'delegate',
    versionNo: 1,
    ...overrides,
  };
}

function render(props: Partial<Parameters<typeof GenerationClient>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(GenerationClient, {
      eventId: EVENT_ID,
      activeTemplates: [makeTemplate()],
      ...props,
    }),
  );
}

describe('GenerationClient', () => {
  it('renders the page title and configuration form', () => {
    const html = render();
    expect(html).toContain('Generate Certificates');
    expect(html).toContain('Configuration');
    expect(html).toContain('Certificate Template');
    expect(html).toContain('Recipients');
    expect(html).toContain('Preview Recipients');
  });

  it('shows template selector with active templates', () => {
    const html = render({
      activeTemplates: [
        makeTemplate({ id: 'tpl-1', templateName: 'Delegate Cert' }),
        makeTemplate({ id: 'tpl-2', templateName: 'Faculty Cert', certificateType: 'faculty_participation' }),
      ],
    });
    expect(html).toContain('Delegate Cert');
    expect(html).toContain('Faculty Cert');
  });

  it('shows recipient type radio buttons', () => {
    const html = render();
    expect(html).toContain('All Confirmed Delegates');
    expect(html).toContain('All Faculty Members');
    expect(html).toContain('All Attendees');
  });

  it('shows eligibility basis selector', () => {
    const html = render();
    expect(html).toContain('Eligibility Basis');
    expect(html).toContain('Registration');
    expect(html).toContain('Attendance');
  });

  it('shows back link to certificates page', () => {
    const html = render();
    expect(html).toContain(`/events/${EVENT_ID}/certificates`);
    expect(html).toContain('Back to Certificates');
  });
});
