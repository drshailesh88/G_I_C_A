import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// ── Mocks ──

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-role', () => ({
  useRole: () => ({ isLoaded: true, isReadOnly: false }),
}));

vi.mock('@/lib/actions/person', () => ({
  createPerson: vi.fn(),
}));

import { PeopleListClient } from './people-list-client';

const PEOPLE = [
  {
    id: 'p1',
    salutation: 'Dr',
    fullName: 'Alice Smith',
    email: 'alice@example.com',
    phoneE164: '+919876543210',
    designation: 'Professor',
    specialty: 'AI',
    organization: 'IIT Delhi',
    city: 'Delhi',
    tags: ['faculty', 'keynote'],
    createdAt: new Date('2026-01-15'),
  },
  {
    id: 'p2',
    salutation: null,
    fullName: 'Bob Jones',
    email: 'bob@example.com',
    phoneE164: null,
    designation: null,
    specialty: null,
    organization: null,
    city: null,
    tags: [],
    createdAt: new Date('2026-02-01'),
  },
];

function render(overrides: Partial<Parameters<typeof PeopleListClient>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(PeopleListClient, {
      people: PEOPLE,
      total: 2,
      page: 1,
      totalPages: 1,
      currentView: 'all',
      currentQuery: '',
      ...overrides,
    }),
  );
}

describe('PeopleListClient responsive migration', () => {
  it('uses ResponsiveList component (has responsive-list container)', () => {
    const html = render();
    expect(html).toContain('data-testid="responsive-list"');
  });

  it('renders person cards with name and designation', () => {
    const html = render();
    expect(html).toContain('Dr. Alice Smith');
    expect(html).toContain('Professor');
    expect(html).toContain('Bob Jones');
  });

  it('renders person cards with email', () => {
    const html = render();
    expect(html).toContain('alice@example.com');
  });

  it('renders tags on person cards', () => {
    const html = render();
    expect(html).toContain('faculty');
    expect(html).toContain('keynote');
  });

  it('renders table view with column headers for desktop', () => {
    const html = render();
    expect(html).toContain('<table');
    expect(html).toContain('Name');
    expect(html).toContain('Email');
  });

  it('shows empty state when no people', () => {
    const html = render({ people: [], total: 0 });
    expect(html).toContain('No people found');
    expect(html).not.toContain('<table');
  });

  it('renders search form', () => {
    const html = render();
    expect(html).toContain('Search');
  });

  it('renders saved view filter pills', () => {
    const html = render();
    expect(html).toContain('All People');
    expect(html).toContain('Faculty');
    expect(html).toContain('Delegates');
  });

  it('renders pagination when multiple pages', () => {
    const html = render({ page: 1, totalPages: 3 });
    expect(html).toContain('Previous');
    expect(html).toContain('Next');
    expect(html).toContain('Page 1 of 3');
  });

  it('hides pagination when single page', () => {
    const html = render({ page: 1, totalPages: 1 });
    expect(html).not.toContain('Previous');
    expect(html).not.toContain('Next');
  });

  it('renders phone and organization in table cells', () => {
    const html = render();
    expect(html).toContain('+919876543210');
    expect(html).toContain('IIT Delhi');
  });

  it('card links point to person detail page', () => {
    const html = render();
    expect(html).toContain('/people/p1');
    expect(html).toContain('/people/p2');
  });

  it('touch targets have minimum 44px height', () => {
    const html = render();
    // Cards should have min-h-[44px] or equivalent padding for touch
    expect(html).toContain('min-h-[44px]');
  });
});
