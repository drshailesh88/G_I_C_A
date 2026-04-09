import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/actions/certificate', () => ({
  createCertificateTemplate: vi.fn(),
  updateCertificateTemplate: vi.fn(),
  activateCertificateTemplate: vi.fn(),
  archiveCertificateTemplate: vi.fn(),
}));
vi.mock('@/lib/actions/certificate-issuance', () => ({
  issueCertificate: vi.fn(),
  revokeCertificate: vi.fn(),
  getCertificateDownloadUrl: vi.fn(),
}));
vi.mock('@/lib/actions/person', () => ({
  searchPeople: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
}));
vi.mock('@/lib/actions/certificate-bulk-zip', () => ({
  bulkZipDownload: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { CertificatesClient } from './certificates-client';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeTemplate(overrides: Partial<Parameters<typeof CertificatesClient>[0]['templates'][0]> = {}) {
  return {
    id: 'tpl-1',
    templateName: 'Delegate Attendance',
    certificateType: 'delegate_attendance',
    audienceScope: 'delegate',
    status: 'draft',
    versionNo: 1,
    allowedVariablesJson: ['full_name', 'event_name'],
    requiredVariablesJson: ['full_name'],
    defaultFileNamePattern: '{{full_name}}-cert.pdf',
    qrVerificationEnabled: true,
    verificationText: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCert(overrides: Partial<Parameters<typeof CertificatesClient>[0]['issuedCertificates'][0]> = {}) {
  return {
    id: 'cert-1',
    certificateNumber: 'GEM2026-ATT-00001',
    certificateType: 'delegate_attendance',
    status: 'issued',
    personId: 'person-1',
    issuedAt: new Date('2026-04-08'),
    revokedAt: null,
    revokeReason: null,
    downloadCount: 3,
    verificationCount: 1,
    lastDownloadedAt: new Date('2026-04-08'),
    lastSentAt: null,
    storageKey: 'certificates/key.pdf',
    ...overrides,
  };
}

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

  it('renders template cards with status badges and edit button', () => {
    const html = render({
      templates: [
        makeTemplate({ id: 'tpl-1', status: 'active', versionNo: 2, qrVerificationEnabled: true }),
        makeTemplate({ id: 'tpl-2', templateName: 'Speaker Recognition', status: 'draft', certificateType: 'speaker_recognition' }),
      ],
    });
    expect(html).toContain('Delegate Attendance');
    expect(html).toContain('Speaker Recognition');
    expect(html).toContain('active');
    expect(html).toContain('draft');
    expect(html).toContain('v2');
    expect(html).toContain('QR'); // QR badge for verification-enabled template
    expect(html).toContain('Edit'); // Edit button for draft/active templates
    expect(html).toContain('Activate');
    expect(html).toContain('Archive');
    expect(html).toContain('Bulk ZIP');
  });

  it('shows Issue Certificate button when active templates exist', () => {
    const html = render({
      templates: [makeTemplate({ status: 'active' })],
    });
    expect(html).toContain('Issue Certificate');
  });

  it('hides Issue Certificate button when no active templates', () => {
    const html = render({
      templates: [makeTemplate({ status: 'draft' })],
    });
    expect(html).not.toContain('Issue Certificate');
  });

  it('counts issued certificates in summary', () => {
    const html = render({
      issuedCertificates: [makeCert()],
    });
    expect(html).toContain('1 issued');
  });

  it('counts only issued status certs, not revoked', () => {
    const html = render({
      issuedCertificates: [makeCert({ status: 'revoked' })],
    });
    expect(html).toContain('0 issued');
  });

  it('renders tab navigation', () => {
    const html = render();
    expect(html).toContain('Templates');
    expect(html).toContain('Issued Certificates');
  });

  it('shows template notes when present', () => {
    const html = render({
      templates: [makeTemplate({ notes: 'For day 1 delegates only' })],
    });
    expect(html).toContain('For day 1 delegates only');
  });
});
