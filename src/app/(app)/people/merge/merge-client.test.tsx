import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/people/merge',
}));

vi.mock('@/lib/actions/person', () => ({
  mergePeople: vi.fn(),
}));

import { MergeClient } from './merge-client';

const KEEP_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DROP_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makePerson(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: KEEP_ID,
    salutation: 'Dr',
    fullName: 'Dr. Rajesh Kumar',
    email: 'rajesh@hospital.in',
    phoneE164: '+919876543210',
    designation: 'Professor',
    specialty: 'Cardiology',
    organization: 'AIIMS Delhi',
    city: 'Delhi',
    bio: 'Experienced cardiologist.',
    photoStorageKey: null,
    tags: ['faculty'],
    ...overrides,
  } as Parameters<typeof MergeClient>[0]['personA'];
}

describe('MergeClient — conflict gate (PKT-A-014)', () => {
  it('disables Confirm Merge initially when records differ on multiple fields', () => {
    const personA = makePerson();
    const personB = makePerson({
      id: DROP_ID,
      fullName: 'Rajesh Kumar',
      email: 'r.kumar@gmail.com',
      organization: 'AIIMS',
    });
    const html = renderToStaticMarkup(createElement(MergeClient, { personA, personB }));
    expect(html).toContain('data-testid="merge-confirm"');
    expect(html).toMatch(/data-testid="merge-confirm"[^>]*\sdisabled(=""|\s|>)/);
    expect(html).toMatch(/data-testid="merge-blocked-message"/);
    expect(html).toMatch(/conflicting field/);
  });

  it('marks differing fields as conflicts requiring resolution', () => {
    const personA = makePerson();
    const personB = makePerson({
      id: DROP_ID,
      fullName: 'Rajesh Kumar',
      email: 'r.kumar@gmail.com',
    });
    const html = renderToStaticMarkup(createElement(MergeClient, { personA, personB }));
    // Conflict markers should appear for the two fields that disagree.
    expect(html).toMatch(/data-testid="merge-row-fullName"[^>]*data-conflict="true"/);
    expect(html).toMatch(/data-testid="merge-row-email"[^>]*data-conflict="true"/);
    // Identical phone numbers must not be flagged.
    expect(html).toMatch(/data-testid="merge-row-phoneE164"[^>]*data-conflict="false"/);
  });

  it('does not flag a field as conflict when one side is empty (auto-resolves)', () => {
    const personA = makePerson({ city: 'Delhi' });
    const personB = makePerson({ id: DROP_ID, city: null });
    const html = renderToStaticMarkup(createElement(MergeClient, { personA, personB }));
    expect(html).toMatch(/data-testid="merge-row-city"[^>]*data-conflict="false"/);
  });

  it('enables Confirm Merge when no conflicts exist (records identical)', () => {
    const personA = makePerson();
    const personB = makePerson({ id: DROP_ID });
    const html = renderToStaticMarkup(createElement(MergeClient, { personA, personB }));
    expect(html).toMatch(/data-testid="merge-confirm"/);
    expect(html).not.toMatch(/data-testid="merge-confirm"[^>]*\sdisabled(=""|\s|>)/);
    expect(html).not.toMatch(/data-testid="merge-blocked-message"/);
  });
});
