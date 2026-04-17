/**
 * Certificate Issuance Utilities
 *
 * Pure logic for:
 * - Supersession chain management
 * - Revocation validation
 * - One-current-valid enforcement
 * - Bulk generation eligibility checks
 * - Certificate number sequence generation
 *
 * All functions are DB-free for unit testing.
 */

import type { CertificateType } from '@/lib/validations/certificate';

// ── Types ────────────────────────────────────────────────────
export type IssuedCertificateRecord = {
  id: string;
  eventId: string;
  personId: string;
  certificateType: string;
  status: string;
  supersededById: string | null;
  supersedesId: string | null;
  revokedAt: Date | null;
  revokeReason: string | null;
};

export type EligibilityCheckResult = {
  eligible: boolean;
  reason?: string;
};

const CERTIFICATE_PREFIX_PATTERN = /^[A-Z]{3}$/;
const MAX_CERTIFICATE_SEQUENCE = 99_999;

function assertValidCertificatePrefix(prefix: string): void {
  if (!CERTIFICATE_PREFIX_PATTERN.test(prefix)) {
    throw new Error('Invalid certificate prefix');
  }
}

function assertValidCertificateYear(year: number): void {
  if (!Number.isSafeInteger(year) || year < 1000 || year > 9999) {
    throw new Error('Invalid certificate year');
  }
}

function formatPlannedCertificateNumber(
  prefix: string,
  year: number,
  sequence: number,
): string {
  assertValidCertificatePrefix(prefix);
  assertValidCertificateYear(year);

  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error('Invalid certificate sequence');
  }

  if (sequence > MAX_CERTIFICATE_SEQUENCE) {
    throw new Error('Certificate number sequence exhausted');
  }

  return `GEM${year}-${prefix}-${String(sequence).padStart(5, '0')}`;
}

// ── Supersession Logic ───────────────────────────────────────

/**
 * Determine if a person already has a current (non-superseded, non-revoked) certificate
 * of the given type for an event.
 */
export function findCurrentCertificate(
  existingCerts: IssuedCertificateRecord[],
  personId: string,
  eventId: string,
  certificateType: string,
): IssuedCertificateRecord | null {
  return existingCerts.find(
    c =>
      c.personId === personId &&
      c.eventId === eventId &&
      c.certificateType === certificateType &&
      c.status === 'issued',
  ) ?? null;
}

/**
 * Build supersession chain data for a regeneration.
 * The old cert gets status='superseded', the new cert links to it.
 *
 * Returns null if there's no existing cert to supersede.
 */
export function buildSupersessionChain(
  existingCert: IssuedCertificateRecord | null,
): {
  oldCertUpdate: { status: 'superseded'; supersededById: string } | null;
  newCertLink: { supersedesId: string } | null;
} {
  if (!existingCert) {
    return { oldCertUpdate: null, newCertLink: null };
  }

  // Can't supersede a revoked certificate — must issue fresh
  if (existingCert.status === 'revoked') {
    return { oldCertUpdate: null, newCertLink: null };
  }

  // Placeholder: supersededById will be set after the new cert is created
  return {
    oldCertUpdate: { status: 'superseded', supersededById: '' },
    newCertLink: { supersedesId: existingCert.id },
  };
}

// ── Revocation Logic ─────────────────────────────────────────

/**
 * Validate that a certificate can be revoked.
 */
export function validateRevocation(
  cert: IssuedCertificateRecord,
  revokeReason: string,
): { valid: boolean; error?: string } {
  if (!revokeReason.trim()) {
    return { valid: false, error: 'Revocation reason is required' };
  }

  if (cert.status === 'revoked') {
    return { valid: false, error: 'Certificate is already revoked' };
  }

  if (cert.status === 'superseded') {
    return { valid: false, error: 'Cannot revoke a superseded certificate — revoke the current version instead' };
  }

  return { valid: true };
}

// ── One-Current-Valid Check ──────────────────────────────────

/**
 * Check if issuing a new certificate would violate the one-current-valid constraint.
 * Returns true if it's safe to issue (either no existing or will be superseded).
 */
export function canIssueNewCertificate(
  existingCerts: IssuedCertificateRecord[],
  personId: string,
  eventId: string,
  certificateType: string,
  willSupersede: boolean,
): { canIssue: boolean; reason?: string; existingCertId?: string } {
  const current = findCurrentCertificate(existingCerts, personId, eventId, certificateType);

  if (!current) {
    return { canIssue: true };
  }

  if (willSupersede) {
    return { canIssue: true, existingCertId: current.id };
  }

  return {
    canIssue: false,
    reason: `Person already has an active ${certificateType} certificate for this event (${current.id}). Use regeneration to supersede it.`,
    existingCertId: current.id,
  };
}

// ── Eligibility Checks ──────────────────────────────────────

/**
 * Check if a person is eligible for a certificate based on their registration/attendance.
 *
 * Rules:
 * - delegate_attendance: must have confirmed registration + event-level attendance
 * - faculty_*: must have session assignments for the event
 * - speaker/chair/panelist/moderator: must have specific role assignments
 * - cme_attendance: must have session-level attendance records
 */
export function checkEligibility(
  certificateType: CertificateType,
  context: {
    hasConfirmedRegistration: boolean;
    hasEventAttendance: boolean;
    hasSessionAttendance: boolean;
    hasSessionAssignment: boolean;
    assignmentRoles: string[];
    sessionAttendanceCount: number;
  },
): EligibilityCheckResult {
  switch (certificateType) {
    case 'delegate_attendance':
      if (!context.hasConfirmedRegistration) {
        return { eligible: false, reason: 'No confirmed registration found' };
      }
      if (!context.hasEventAttendance) {
        return { eligible: false, reason: 'No event-level attendance record found' };
      }
      return { eligible: true };

    case 'faculty_participation':
      if (!context.hasSessionAssignment) {
        return { eligible: false, reason: 'No session assignments found for this person' };
      }
      return { eligible: true };

    case 'speaker_recognition':
      if (!context.hasSessionAssignment) {
        return { eligible: false, reason: 'No session assignments found for this person' };
      }
      if (!context.assignmentRoles.includes('speaker')) {
        return { eligible: false, reason: 'Person is not assigned as a speaker' };
      }
      return { eligible: true };

    case 'chairperson_recognition':
      if (!context.hasSessionAssignment) {
        return { eligible: false, reason: 'No session assignments found for this person' };
      }
      if (!context.assignmentRoles.includes('chairperson')) {
        return { eligible: false, reason: 'Person is not assigned as a chairperson' };
      }
      return { eligible: true };

    case 'panelist_recognition':
      if (!context.hasSessionAssignment) {
        return { eligible: false, reason: 'No session assignments found for this person' };
      }
      if (!context.assignmentRoles.includes('panelist')) {
        return { eligible: false, reason: 'Person is not assigned as a panelist' };
      }
      return { eligible: true };

    case 'moderator_recognition':
      if (!context.hasSessionAssignment) {
        return { eligible: false, reason: 'No session assignments found for this person' };
      }
      if (!context.assignmentRoles.includes('moderator')) {
        return { eligible: false, reason: 'Person is not assigned as a moderator' };
      }
      return { eligible: true };

    case 'cme_attendance':
      if (!context.hasSessionAttendance) {
        return { eligible: false, reason: 'No session-level attendance records found' };
      }
      if (context.sessionAttendanceCount === 0) {
        return { eligible: false, reason: 'Must attend at least one session for CME credit' };
      }
      return { eligible: true };

    default:
      return { eligible: false, reason: `Unknown certificate type: ${certificateType}` };
  }
}

// ── Download Access Validation ──────────────────────────────

/**
 * Validate that a certificate can be downloaded.
 * Only 'issued' certificates may be downloaded — revoked and superseded are blocked.
 */
export function validateDownloadAccess(
  cert: IssuedCertificateRecord & { storageKey?: string },
): { allowed: boolean; error?: string } {
  if (cert.status === 'revoked') {
    return { allowed: false, error: 'Cannot download a revoked certificate' };
  }
  if (cert.status === 'superseded') {
    return { allowed: false, error: 'Cannot download a superseded certificate — download the current version instead' };
  }
  if (cert.storageKey !== undefined && !cert.storageKey) {
    return { allowed: false, error: 'Certificate PDF has not been generated yet' };
  }
  return { allowed: true };
}

// ── Certificate Number Sequence ──────────────────────────────

/**
 * Compute the next sequence number for a certificate type from existing certificates.
 * Used when generating in bulk — each call gets the next number.
 */
export function getNextSequence(
  existingNumbers: string[],
  prefix: string,
): number {
  assertValidCertificatePrefix(prefix);
  let maxSeq = 0;
  const pattern = new RegExp(`^GEM\\d{4}-${prefix}-(\\d{5})$`);

  for (const num of existingNumbers) {
    const match = num.match(pattern);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (seq > maxSeq) maxSeq = seq;
    }
  }

  const nextSeq = maxSeq + 1;
  if (nextSeq > MAX_CERTIFICATE_SEQUENCE) {
    throw new Error('Certificate number sequence exhausted');
  }

  return nextSeq;
}

// ── Bulk Generation Helpers ──────────────────────────────────

export type BulkGenerationPlan = {
  toIssue: Array<{
    personId: string;
    certificateNumber: string;
    supersedes: string | null;
  }>;
  skipped: Array<{
    personId: string;
    reason: string;
  }>;
};

/**
 * Plan a bulk generation — determine which persons get new certificates
 * and which are skipped (already have current, ineligible, etc.).
 */
export function planBulkGeneration(
  personIds: string[],
  eventId: string,
  certificateType: string,
  existingCerts: IssuedCertificateRecord[],
  prefix: string,
  existingNumbers: string[],
  year: number,
): BulkGenerationPlan {
  const toIssue: BulkGenerationPlan['toIssue'] = [];
  const skipped: BulkGenerationPlan['skipped'] = [];
  assertValidCertificatePrefix(prefix);
  assertValidCertificateYear(year);
  let nextSeq = getNextSequence(existingNumbers, prefix);

  if (personIds.length > MAX_CERTIFICATE_SEQUENCE - nextSeq + 1) {
    throw new Error('Certificate number sequence exhausted');
  }

  for (const personId of personIds) {
    const current = findCurrentCertificate(existingCerts, personId, eventId, certificateType);

    const certNumber = formatPlannedCertificateNumber(prefix, year, nextSeq);
    nextSeq++;

    toIssue.push({
      personId,
      certificateNumber: certNumber,
      supersedes: current?.id ?? null,
    });
  }

  return { toIssue, skipped };
}
