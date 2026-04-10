import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) =>
    createElement('a', { href, ...props }, children),
}));

vi.mock('@/hooks/use-role', () => ({
  useRole: () => ({ isSuperAdmin: false, canWrite: true, isLoaded: true }),
}));

vi.mock('@/lib/actions/person', () => ({
  archivePerson: vi.fn(),
  restorePerson: vi.fn(),
  anonymizePerson: vi.fn(),
}));

import { PersonDetailClient } from './person-detail-client';

const PERSON = {
  id: 'p1',
  salutation: 'Dr',
  fullName: 'Jane Smith',
  email: 'jane@example.com',
  phoneE164: '+919876543210',
  designation: 'Professor',
  specialty: 'Cardiology',
  organization: 'AIIMS',
  city: 'Delhi',
  tags: ['faculty', 'speaker'],
  archivedAt: null,
  anonymizedAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-06-01'),
  createdBy: 'user1',
};

function render(person = PERSON) {
  return renderToStaticMarkup(createElement(PersonDetailClient, { person }));
}

describe('PersonDetailClient responsive migration', () => {
  it('uses fluid font-size tokens for headings', () => {
    const html = render();
    expect(html).toContain('var(--font-size-');
  });

  it('uses fluid spacing tokens', () => {
    const html = render();
    expect(html).toContain('var(--space-');
  });

  it('renders a 2-column info grid for desktop via CSS grid', () => {
    const html = render();
    // Should have a grid container for contact info on desktop
    expect(html).toContain('display:grid');
  });

  it('still renders person info correctly', () => {
    const html = render();
    expect(html).toContain('Dr. Jane Smith');
    expect(html).toContain('jane@example.com');
    expect(html).toContain('AIIMS');
    expect(html).toContain('Cardiology');
  });
});
