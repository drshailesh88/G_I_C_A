import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/actions/registration', () => ({
  registerForEvent: vi.fn(),
}));

import { RegistrationFormClient } from './registration-form-client';

function render() {
  return renderToStaticMarkup(
    createElement(RegistrationFormClient, {
      eventId: 'evt1',
      eventSlug: 'test-event',
      eventName: 'Test Conference',
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

  it('renders the back link', () => {
    const html = render();
    expect(html).toContain('/e/test-event');
  });

  it('renders event name', () => {
    const html = render();
    expect(html).toContain('Test Conference');
  });
});
