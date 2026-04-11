/**
 * Mutation-killing tests for system-templates.ts
 *
 * Targets: 82 Survived (58 StringLiteral + 24 ArrayDeclaration).
 * Strategy: Assert exact string values and array contents for each template.
 */

import { describe, it, expect } from 'vitest';
import {
  SYSTEM_TEMPLATE_SEEDS,
  getSystemTemplateKeys,
  getSeedsForKey,
} from './system-templates';

describe('System template exact values', () => {
  // ── Registration Confirmation ────────────────────────────────
  describe('registration_confirmation', () => {
    it('email seed has correct templateName and subject', () => {
      const email = getSeedsForKey('registration_confirmation').find(s => s.channel === 'email')!;
      expect(email.templateName).toBe('Registration Confirmation Email');
      expect(email.subjectLine).toBe('Registration Confirmed — {{eventName}}');
      expect(email.metaCategory).toBe('registration');
      expect(email.triggerType).toBe('registration.created');
      expect(email.sendMode).toBe('automatic');
    });

    it('whatsapp seed has correct templateName and null subject', () => {
      const wa = getSeedsForKey('registration_confirmation').find(s => s.channel === 'whatsapp')!;
      expect(wa.templateName).toBe('Registration Confirmation WhatsApp');
      expect(wa.subjectLine).toBeNull();
      expect(wa.metaCategory).toBe('registration');
    });

    it('has correct required variables', () => {
      const email = getSeedsForKey('registration_confirmation').find(s => s.channel === 'email')!;
      expect(email.requiredVariablesJson).toEqual(
        expect.arrayContaining(['fullName', 'eventName', 'registrationNumber']),
      );
    });

    it('has correct allowed variables', () => {
      const email = getSeedsForKey('registration_confirmation').find(s => s.channel === 'email')!;
      expect(email.allowedVariablesJson.length).toBeGreaterThan(0);
      expect(email.allowedVariablesJson).toContain('fullName');
      expect(email.allowedVariablesJson).toContain('eventName');
      expect(email.allowedVariablesJson).toContain('registrationNumber');
    });
  });

  // ── Registration Cancelled ──────────────────────────────────
  describe('registration_cancelled', () => {
    it('email seed has correct values', () => {
      const email = getSeedsForKey('registration_cancelled').find(s => s.channel === 'email')!;
      expect(email.templateName).toBe('Registration Cancelled Email');
      expect(email.subjectLine).toContain('Cancelled');
      expect(email.metaCategory).toBe('registration');
      expect(email.triggerType).toBe('registration.cancelled');
    });

    it('whatsapp seed has correct values', () => {
      const wa = getSeedsForKey('registration_cancelled').find(s => s.channel === 'whatsapp')!;
      expect(wa.templateName).toContain('WhatsApp');
      expect(wa.subjectLine).toBeNull();
    });
  });

  // ── Faculty Invitation ──────────────────────────────────────
  describe('faculty_invitation', () => {
    it('email seed has correct values', () => {
      const email = getSeedsForKey('faculty_invitation').find(s => s.channel === 'email')!;
      expect(email.templateName).toBe('Faculty Invitation Email');
      expect(email.subjectLine).toContain('Invitation');
      expect(email.metaCategory).toBe('program');
      expect(email.triggerType).toBe('faculty.invitation');
    });
  });

  // ── Faculty Reminder ────────────────────────────────────────
  describe('faculty_reminder', () => {
    it('email seed has correct values', () => {
      const email = getSeedsForKey('faculty_reminder').find(s => s.channel === 'email')!;
      expect(email.templateName).toBe('Faculty Reminder Email');
      expect(email.subjectLine).toContain('Reminder');
      expect(email.metaCategory).toBe('program');
      expect(email.sendMode).toBe('manual');
    });
  });

  // ── Program Update ──────────────────────────────────────────
  describe('program_update', () => {
    it('email seed has correct values', () => {
      const email = getSeedsForKey('program_update').find(s => s.channel === 'email')!;
      expect(email.templateName).toBe('Program Update Email');
      expect(email.subjectLine).toContain('Program');
      expect(email.metaCategory).toBe('program');
    });
  });

  // ── Travel Update ───────────────────────────────────────────
  describe('travel_update', () => {
    it('email seed has correct values', () => {
      const email = getSeedsForKey('travel_update').find(s => s.channel === 'email')!;
      expect(email.templateName).toBe('Travel Update Email');
      expect(email.subjectLine).toContain('Travel');
      expect(email.metaCategory).toBe('logistics');
      expect(email.triggerType).toBe('travel.updated');
      expect(email.sendMode).toBe('automatic');
    });
  });

  // ── Travel Cancelled ────────────────────────────────────────
  describe('travel_cancelled', () => {
    it('email seed has correct values', () => {
      const email = getSeedsForKey('travel_cancelled').find(s => s.channel === 'email')!;
      expect(email.templateName).toBe('Travel Cancelled Email');
      expect(email.subjectLine).toContain('Cancelled');
      expect(email.triggerType).toBe('travel.cancelled');
    });
  });

  // ── Accommodation Details ───────────────────────────────────
  describe('accommodation_details', () => {
    it('email seed has correct values', () => {
      const email = getSeedsForKey('accommodation_details').find(s => s.channel === 'email')!;
      expect(email.templateName).toBe('Accommodation Details Email');
      expect(email.subjectLine).toContain('Accommodation');
      expect(email.metaCategory).toBe('logistics');
    });
  });

  // ── Accommodation Update ────────────────────────────────────
  describe('accommodation_update', () => {
    it('email seed has correct values', () => {
      const email = getSeedsForKey('accommodation_update').find(s => s.channel === 'email')!;
      expect(email.templateName).toBe('Accommodation Update Email');
      expect(email.triggerType).toBe('accommodation.updated');
    });
  });

  // ── Accommodation Cancelled ─────────────────────────────────
  describe('accommodation_cancelled', () => {
    it('email seed has correct values', () => {
      const email = getSeedsForKey('accommodation_cancelled').find(s => s.channel === 'email')!;
      expect(email.templateName).toBe('Accommodation Cancelled Email');
      expect(email.triggerType).toBe('accommodation.cancelled');
    });
  });

  // ── Certificate Ready ───────────────────────────────────────
  describe('certificate_ready', () => {
    it('email seed has correct values', () => {
      const email = getSeedsForKey('certificate_ready').find(s => s.channel === 'email')!;
      expect(email.templateName).toBe('Certificate Ready Email');
      expect(email.subjectLine).toContain('Certificate');
      expect(email.metaCategory).toBe('certificates');
    });
  });

  // ── Event Reminder ──────────────────────────────────────────
  describe('event_reminder', () => {
    it('email seed has correct values', () => {
      const email = getSeedsForKey('event_reminder').find(s => s.channel === 'email')!;
      expect(email.templateName).toBe('Event Reminder Email');
      expect(email.subjectLine).toContain('Reminder');
      expect(email.metaCategory).toBe('reminders');
      expect(email.sendMode).toBe('manual');
    });
  });

  // ── Cross-cutting assertions ────────────────────────────────
  it('every email seed has non-empty previewText', () => {
    const emailSeeds = SYSTEM_TEMPLATE_SEEDS.filter(s => s.channel === 'email');
    for (const seed of emailSeeds) {
      expect(seed.previewText, `${seed.templateKey} missing previewText`).toBeTruthy();
      expect(typeof seed.previewText).toBe('string');
    }
  });

  it('every whatsapp seed has null previewText', () => {
    const waSeeds = SYSTEM_TEMPLATE_SEEDS.filter(s => s.channel === 'whatsapp');
    for (const seed of waSeeds) {
      expect(seed.previewText, `${seed.templateKey}/whatsapp should have null previewText`).toBeNull();
    }
  });

  it('every seed has isSystemTemplate = true', () => {
    for (const seed of SYSTEM_TEMPLATE_SEEDS) {
      expect(seed.isSystemTemplate).toBe(true);
    }
  });

  it('every seed has non-empty allowedVariablesJson array', () => {
    for (const seed of SYSTEM_TEMPLATE_SEEDS) {
      expect(Array.isArray(seed.allowedVariablesJson)).toBe(true);
      expect(seed.allowedVariablesJson.length).toBeGreaterThan(0);
    }
  });

  it('every seed has non-empty requiredVariablesJson array', () => {
    for (const seed of SYSTEM_TEMPLATE_SEEDS) {
      expect(Array.isArray(seed.requiredVariablesJson)).toBe(true);
      expect(seed.requiredVariablesJson.length).toBeGreaterThan(0);
    }
  });

  it('body content contains expected placeholders per key', () => {
    const keyPlaceholders: Record<string, string[]> = {
      registration_confirmation: ['fullName', 'eventName', 'registrationNumber'],
      registration_cancelled: ['fullName', 'eventName'],
      faculty_invitation: ['fullName', 'eventName'],
      faculty_reminder: ['fullName', 'eventName'],
      program_update: ['fullName', 'eventName'],
      travel_update: ['fullName', 'eventName'],
      travel_cancelled: ['fullName', 'eventName'],
      accommodation_details: ['fullName', 'eventName'],
      accommodation_update: ['fullName', 'eventName'],
      accommodation_cancelled: ['fullName', 'eventName'],
      certificate_ready: ['fullName', 'eventName'],
      event_reminder: ['fullName', 'eventName'],
    };

    for (const [key, expectedVars] of Object.entries(keyPlaceholders)) {
      const seeds = getSeedsForKey(key);
      for (const seed of seeds) {
        for (const v of expectedVars) {
          expect(
            seed.bodyContent,
            `${key}/${seed.channel} body should contain {{${v}}}`,
          ).toContain(`{{${v}}}`);
        }
      }
    }
  });

  it('each template key pair returns exactly 2 seeds', () => {
    const keys = getSystemTemplateKeys();
    for (const key of keys) {
      const seeds = getSeedsForKey(key);
      expect(seeds).toHaveLength(2);
    }
  });
});
