import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/actions/registration', () => ({
  registerForEvent: vi.fn(),
}));

import { RegistrationFormClient, serializeCustomFieldValue } from './registration-form-client';

function render() {
  return renderToStaticMarkup(
    createElement(RegistrationFormClient, {
      eventId: 'evt1',
      eventSlug: 'test-event',
      eventName: 'Test Conference',
      registrationOpen: true,
    })
  );
}

describe('RegistrationFormClient responsive layout', () => {
  it('uses FormGrid for responsive layout', () => {
    const html = render();
    // FormGrid renders a div with grid classes
    expect(html).toContain('md:grid-cols-2');
  });

  it('renders all form fields', () => {
    const html = render();
    expect(html).toContain('Full Name');
    expect(html).toContain('Email');
    expect(html).toContain('Mobile Number');
    expect(html).toContain('Designation');
    expect(html).toContain('Specialty');
    expect(html).toContain('Organization');
    expect(html).toContain('City');
    expect(html).toContain('Age');
  });

  it('marks required fields', () => {
    const html = render();
    // Required fields should have asterisks
    const requiredCount = (html.match(/text-error/g) || []).length;
    // fullName, email, phone are required
    expect(requiredCount).toBeGreaterThanOrEqual(3);
  });

  it('renders single-column on mobile (grid-cols-1 base)', () => {
    const html = render();
    expect(html).toContain('grid-cols-1');
  });

  it('full-width fields use col-span-full', () => {
    const html = render();
    // Organization, designation, specialty should span full width
    expect(html).toContain('col-span-full');
  });

  it('renders the submit button', () => {
    const html = render();
    expect(html).toContain('Complete Registration');
  });

  it('shows a closed message and disables the form when registration is closed', () => {
    const html = renderToStaticMarkup(
      createElement(RegistrationFormClient, {
        eventId: 'evt1',
        eventSlug: 'test-event',
        eventName: 'Test Conference',
        registrationOpen: false,
      })
    );

    expect(html).toContain('Registration closed');
    expect(html).toContain('<fieldset disabled=""');
  });

  it('renders the back link', () => {
    const html = render();
    expect(html).toContain('/e/test-event');
  });

  it('renders event name', () => {
    const html = render();
    expect(html).toContain('Test Conference');
  });
});

describe('serializeCustomFieldValue', () => {
  it('preserves file metadata instead of coercing File objects to [object File]', () => {
    const value = serializeCustomFieldValue(
      {
        id: '99999999-9999-9999-9999-999999999999',
        type: 'file',
        label: 'Supporting Document',
        required: false,
      },
      new File(['hello'], 'proof.pdf', { type: 'application/pdf' }),
    );

    expect(value).toEqual({
      name: 'proof.pdf',
      size: 5,
      type: 'application/pdf',
    });
  });

  it('skips empty file selections', () => {
    const value = serializeCustomFieldValue(
      {
        id: '99999999-9999-9999-9999-999999999999',
        type: 'file',
        label: 'Supporting Document',
        required: false,
      },
      new File([], '', { type: 'application/pdf' }),
    );

    expect(value).toBeUndefined();
  });
});
