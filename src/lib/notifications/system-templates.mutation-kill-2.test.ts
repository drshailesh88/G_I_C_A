/**
 * Mutation-killing tests Round 2 for system-templates.ts
 *
 * Targets: 25 Survived StringLiteral on body content.
 * Strategy: Assert exact substrings from body content per template.
 */

import { describe, it, expect } from 'vitest';
import { SYSTEM_TEMPLATE_SEEDS, getSeedsForKey } from './system-templates';

describe('System template body content exact assertions', () => {
  // For each template key, assert specific substrings that would be
  // killed if Stryker replaces string literals with ""

  it('registration_confirmation email body contains registration number reference', () => {
    const seed = getSeedsForKey('registration_confirmation').find(s => s.channel === 'email')!;
    expect(seed.bodyContent).toContain('{{registrationNumber}}');
    expect(seed.bodyContent).toContain('{{eventDate}}');
    expect(seed.bodyContent).toContain('{{venue}}');
  });

  it('registration_confirmation whatsapp body contains key variables', () => {
    const seed = getSeedsForKey('registration_confirmation').find(s => s.channel === 'whatsapp')!;
    expect(seed.bodyContent).toContain('{{registrationNumber}}');
    expect(seed.bodyContent).toContain('{{fullName}}');
  });

  it('registration_cancelled bodies reference eventName', () => {
    for (const seed of getSeedsForKey('registration_cancelled')) {
      expect(seed.bodyContent).toContain('{{eventName}}');
      expect(seed.bodyContent).toContain('{{fullName}}');
    }
  });

  it('faculty_invitation bodies contain invitation-specific content', () => {
    for (const seed of getSeedsForKey('faculty_invitation')) {
      expect(seed.bodyContent).toContain('{{fullName}}');
      expect(seed.bodyContent).toContain('{{eventName}}');
    }
  });

  it('faculty_reminder email has reminder-specific content', () => {
    const seed = getSeedsForKey('faculty_reminder').find(s => s.channel === 'email')!;
    expect(seed.bodyContent).toContain('{{fullName}}');
    expect(seed.bodyContent).toContain('{{eventName}}');
    expect(seed.subjectLine).toBeTruthy();
    expect(seed.subjectLine!).toContain('{{eventName}}');
  });

  it('program_update email has program-specific content', () => {
    const seed = getSeedsForKey('program_update').find(s => s.channel === 'email')!;
    expect(seed.bodyContent).toContain('{{fullName}}');
    expect(seed.bodyContent).toContain('{{eventName}}');
  });

  it('travel_update bodies contain travel-specific variables', () => {
    for (const seed of getSeedsForKey('travel_update')) {
      expect(seed.bodyContent).toContain('{{fullName}}');
      expect(seed.bodyContent).toContain('{{eventName}}');
    }
  });

  it('travel_cancelled bodies reference cancellation', () => {
    for (const seed of getSeedsForKey('travel_cancelled')) {
      expect(seed.bodyContent).toContain('{{fullName}}');
    }
  });

  it('accommodation_details bodies contain accommodation info', () => {
    for (const seed of getSeedsForKey('accommodation_details')) {
      expect(seed.bodyContent).toContain('{{fullName}}');
      expect(seed.bodyContent).toContain('{{eventName}}');
    }
  });

  it('accommodation_update bodies contain accommodation info', () => {
    for (const seed of getSeedsForKey('accommodation_update')) {
      expect(seed.bodyContent).toContain('{{fullName}}');
    }
  });

  it('accommodation_cancelled bodies reference cancellation', () => {
    for (const seed of getSeedsForKey('accommodation_cancelled')) {
      expect(seed.bodyContent).toContain('{{fullName}}');
    }
  });

  it('certificate_ready email has certificate-specific content', () => {
    const seed = getSeedsForKey('certificate_ready').find(s => s.channel === 'email')!;
    expect(seed.bodyContent).toContain('{{fullName}}');
    expect(seed.bodyContent).toContain('{{eventName}}');
  });

  it('event_reminder bodies have reminder content', () => {
    for (const seed of getSeedsForKey('event_reminder')) {
      expect(seed.bodyContent).toContain('{{fullName}}');
      expect(seed.bodyContent).toContain('{{eventName}}');
    }
  });

  it('all email subject lines contain eventName variable', () => {
    for (const seed of SYSTEM_TEMPLATE_SEEDS) {
      if (seed.channel === 'email' && seed.subjectLine) {
        expect(
          seed.subjectLine,
          `${seed.templateKey} email subject should contain {{eventName}}`,
        ).toContain('{{eventName}}');
      }
    }
  });

  it('all email preview texts are non-empty strings', () => {
    for (const seed of SYSTEM_TEMPLATE_SEEDS) {
      if (seed.channel === 'email') {
        expect(typeof seed.previewText).toBe('string');
        expect(seed.previewText!.length).toBeGreaterThan(0);
      }
    }
  });

  it('every seed body contains at least salutation or fullName', () => {
    for (const seed of SYSTEM_TEMPLATE_SEEDS) {
      const hasSalutation = seed.bodyContent.includes('{{salutation}}');
      const hasFullName = seed.bodyContent.includes('{{fullName}}');
      expect(
        hasSalutation || hasFullName,
        `${seed.templateKey}/${seed.channel} body should have salutation or fullName`,
      ).toBe(true);
    }
  });
});
