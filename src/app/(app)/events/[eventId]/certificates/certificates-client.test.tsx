import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock all server actions
vi.mock('@/lib/actions/certificate', () => ({
  createCertificateTemplate: vi.fn(),
  activateCertificateTemplate: vi.fn(),
  archiveCertificateTemplate: vi.fn(),
}));
vi.mock('@/lib/actions/certificate-issuance', () => ({
  revokeCertificate: vi.fn(),
  getCertificateDownloadUrl: vi.fn(),
}));
vi.mock('@/lib/actions/certificate-bulk-zip', () => ({
  bulkZipDownload: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { CertificatesClient } from './certificates-client';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

function render(props: Partial<Parameters<typeof CertificatesClient>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(CertificatesClient, {
      eventId: EVENT_ID,
      templates: [],
      issuedCertificates: [],
      ...props,
    }),
  );
}

describe('CertificatesClient', () => {
  it('renders the page title and summary', () => {
    const html = render();
    expect(html).toContain('Certificates');
    expect(html).toContain('0 templates');
    expect(html).toContain('0 issued');
  });

  it('shows empty state when no templates', () => {
    const html = render();
    expect(html).toContain('No certificate templates yet');
  });

  it('renders template cards with status badges', () => {
    const html = render({
      templates: [
        {
          id: 'tpl-1',
          templateName: 'Delegate Attendance',
          certificateType: 'delegate_attendance',
          audienceScope: 'delegate',
          status: 'active',
          versionNo: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'tpl-2',
          templateName: 'Speaker Recognition',
          certificateType: 'speaker_recognition',
          audienceScope: 'speaker',
          status: 'draft',
          versionNo: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    expect(html).toContain('Delegate Attendance');
    expect(html).toContain('Speaker Recognition');
    expect(html).toContain('active');
    expect(html).toContain('draft');
    expect(html).toContain('v2');
    expect(html).toContain('Activate'); // draft template gets Activate button
    expect(html).toContain('Archive');
    expect(html).toContain('Bulk ZIP'); // active template gets Bulk ZIP button
  });

  it('counts issued certificates in summary even when templates tab is active', () => {
    const html = render({
      issuedCertificates: [
        {
          id: 'cert-1',
          certificateNumber: 'GEM2026-ATT-00001',
          certificateType: 'delegate_attendance',
          status: 'issued',
          personId: 'person-1',
          issuedAt: new Date('2026-04-08'),
          revokedAt: null,
          revokeReason: null,
          downloadCount: 3,
          storageKey: 'certificates/key.pdf',
        },
      ],
    });
    // Summary shows issued count regardless of active tab
    expect(html).toContain('1 issued');
    // The Issued Certificates tab label is always visible
    expect(html).toContain('Issued Certificates');
  });

  it('counts only issued status certs in summary, not revoked', () => {
    const html = render({
      issuedCertificates: [
        {
          id: 'cert-2',
          certificateNumber: 'GEM2026-ATT-00002',
          certificateType: 'delegate_attendance',
          status: 'revoked',
          personId: 'person-2',
          issuedAt: new Date('2026-04-07'),
          revokedAt: new Date('2026-04-08'),
          revokeReason: 'Issued in error',
          downloadCount: 0,
          storageKey: null,
        },
      ],
    });
    // Revoked certs are not counted as "issued" in summary
    expect(html).toContain('0 issued');
  });

  it('includes New Template button', () => {
    const html = render();
    expect(html).toContain('New Template');
  });

  it('renders tab navigation', () => {
    const html = render();
    expect(html).toContain('Templates');
    expect(html).toContain('Issued Certificates');
  });
});
