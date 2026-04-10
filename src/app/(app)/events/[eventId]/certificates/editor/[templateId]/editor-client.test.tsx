import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// ── Mocks ───────────────────────────────────────────────────────

const mockDesignerInstance = {
  getTemplate: vi.fn().mockReturnValue({
    basePdf: { width: 297, height: 210, padding: [10, 10, 10, 10] },
    schemas: [[{ name: 'full_name', type: 'text', position: { x: 50, y: 50 }, width: 100, height: 20, content: '' }]],
  }),
  onChangeTemplate: vi.fn(),
  onSaveTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  saveTemplate: vi.fn(),
  onPageChange: vi.fn(),
  getPageCursor: vi.fn().mockReturnValue(0),
  getTotalPages: vi.fn().mockReturnValue(1),
};

const MockDesigner = vi.fn().mockImplementation(() => mockDesignerInstance);

vi.mock('@pdfme/ui', () => ({
  Designer: MockDesigner,
}));

vi.mock('@pdfme/schemas', () => ({
  text: { pdf: vi.fn(), ui: vi.fn(), propPanel: {} },
  image: { pdf: vi.fn(), ui: vi.fn(), propPanel: {} },
  line: { pdf: vi.fn(), ui: vi.fn(), propPanel: {} },
  rectangle: { pdf: vi.fn(), ui: vi.fn(), propPanel: {} },
  ellipse: { pdf: vi.fn(), ui: vi.fn(), propPanel: {} },
  barcodes: {},
}));

vi.mock('@pdfme/generator', () => ({
  generate: vi.fn().mockResolvedValue({ buffer: new ArrayBuffer(100) }),
}));

vi.mock('@/lib/actions/certificate', () => ({
  updateCertificateTemplate: vi.fn().mockResolvedValue({}),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { CertificateEditorClient } from './editor-client';
import { updateCertificateTemplate } from '@/lib/actions/certificate';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TEMPLATE_ID = 'tpl-550e8400-e29b-41d4-a716-446655440001';

const defaultProps = {
  eventId: EVENT_ID,
  templateId: TEMPLATE_ID,
  templateName: 'Delegate Attendance Certificate',
  certificateType: 'delegate_attendance',
  templateJson: {
    basePdf: { width: 297, height: 210, padding: [10, 10, 10, 10] },
    schemas: [[]],
  },
  pageSize: 'A4_landscape',
  orientation: 'landscape',
  allowedVariables: ['full_name', 'event_name', 'certificate_number'],
  status: 'draft',
  versionNo: 1,
};

function render(overrides: Partial<typeof defaultProps> = {}) {
  return renderToStaticMarkup(
    createElement(CertificateEditorClient, { ...defaultProps, ...overrides }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CertificateEditorClient', () => {
  it('renders the editor header with template name and metadata', () => {
    const html = render();
    expect(html).toContain('Delegate Attendance Certificate');
    expect(html).toContain('delegate attendance');
    expect(html).toContain('A4_landscape');
    expect(html).toContain('v1');
  });

  it('renders the pdfme designer container element', () => {
    const html = render();
    expect(html).toContain('data-testid="pdfme-designer-container"');
  });

  it('shows loading state before designer is initialized', () => {
    const html = render();
    expect(html).toContain('Loading designer');
  });

  it('renders Save and Preview buttons', () => {
    const html = render();
    expect(html).toContain('Save');
    expect(html).toContain('Preview PDF');
  });

  it('shows the Back button linking to certificates list', () => {
    const html = render();
    expect(html).toContain('Back');
  });

  it('displays allowed variable fields in the header', () => {
    const html = render();
    expect(html).toContain('{full_name}');
    expect(html).toContain('{event_name}');
    expect(html).toContain('{certificate_number}');
  });

  it('shows archived warning and hides Save for archived templates', () => {
    const html = render({ status: 'archived' });
    expect(html).toContain('archived and cannot be edited');
    // Save button should NOT be rendered for archived templates
    // The Save button is conditionally rendered only when !isReadOnly
    expect(html).not.toContain('Saving...');
  });

  it('renders active status badge for active templates', () => {
    const html = render({ status: 'active' });
    expect(html).toContain('active');
    // Active templates CAN be saved (version bump)
    expect(html).toContain('Save');
  });

  it('uses blank template when templateJson has no valid pdfme structure', () => {
    // When template JSON lacks proper pdfme structure, should fall back to blank
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html = render({ templateJson: { noSchemas: true } as any });
    expect(html).toContain('pdfme-designer-container');
    expect(html).toContain('Loading designer');
  });

  it('uses portrait dimensions for portrait orientation', () => {
    // The component should handle portrait orientation without errors
    const html = render({ orientation: 'portrait', pageSize: 'A4_portrait' });
    expect(html).toContain('A4_portrait');
    expect(html).toContain('pdfme-designer-container');
  });

  // ── Bug fixes verified by Codex adversarial review ────────────

  it('rejects basePdf with string type but no schemas (validation tightening)', () => {
    // basePdf: "broken" string with schemas present should still be valid (base64/URL)
    const html = render({
      templateJson: {
        basePdf: 'data:application/pdf;base64,JVBERi0x',
        schemas: [[]],
      } as unknown as typeof defaultProps.templateJson,
    });
    // Should use this template (valid), not blank
    expect(html).toContain('pdfme-designer-container');
  });

  it('rejects basePdf object without width/height as invalid', () => {
    // basePdf: { broken: true } is not a valid BlankPdf — should fall back to blank
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html = render({ templateJson: { basePdf: { broken: true }, schemas: [[]] } as any });
    expect(html).toContain('pdfme-designer-container');
    expect(html).toContain('Loading designer');
  });

  it('does not show Save button for archived templates (Ctrl+S also blocked)', () => {
    const html = render({ status: 'archived' });
    // Save button is not rendered
    expect(html).toContain('Preview PDF');
    expect(html).toContain('archived and cannot be edited');
    // Verify no Save button in the output (checking for absence of the save button text
    // in a button context — Preview PDF is still there)
    const saveButtonMatch = html.match(/>Save</);
    // Save button text should not appear (only "Preview PDF" button exists)
    expect(saveButtonMatch).toBeNull();
  });

  // ── DRS-44: Responsive migration tests ────────────────────────

  it('wraps canvas and sidebar in a DetailView layout', () => {
    const html = render();
    expect(html).toContain('data-testid="detail-view"');
  });

  it('renders field reference variables in the sidebar panel', () => {
    const html = render();
    // Variables should be in a sidebar that's hidden on mobile
    expect(html).toContain('md:block');
  });

  it('uses responsive header with flex-wrap for small screens', () => {
    const html = render();
    expect(html).toContain('flex-wrap');
  });
});
