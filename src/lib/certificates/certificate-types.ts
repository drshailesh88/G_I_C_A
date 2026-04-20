/**
 * Certificate Type Registry
 *
 * 7 V1 certificate types with audience scope mappings,
 * default variable sets, and naming conventions.
 *
 * Types:
 * 1. delegate_attendance    — Delegates who attended the event
 * 2. faculty_participation  — Faculty who participated as any role
 * 3. speaker_recognition    — Speakers specifically
 * 4. chairperson_recognition — Chairpersons specifically
 * 5. panelist_recognition   — Panelists specifically
 * 6. moderator_recognition  — Moderators specifically
 * 7. cme_attendance         — CME credit eligible attendees
 */

import type { CertificateType, AudienceScope, EligibilityBasisType } from '@/lib/validations/certificate';

export type CertificateTypeConfig = {
  type: CertificateType;
  displayName: string;
  description: string;
  audienceScope: AudienceScope;
  eligibilityBasisType: EligibilityBasisType;
  defaultVariables: string[];
  requiredVariables: string[];
  defaultFileNamePattern: string;
  certificateNumberPrefix: string;
  // Whether this type requires session-level attendance (not just event-level)
  requiresSessionAttendance: boolean;
};

function freezeCertificateConfig(config: CertificateTypeConfig): CertificateTypeConfig {
  return Object.freeze({
    ...config,
    defaultVariables: Object.freeze([...config.defaultVariables]),
    requiredVariables: Object.freeze([...config.requiredVariables]),
  }) as unknown as CertificateTypeConfig;
}

const RAW_CERTIFICATE_TYPE_CONFIGS: Record<CertificateType, CertificateTypeConfig> = {
  delegate_attendance: {
    type: 'delegate_attendance',
    displayName: 'Delegate Attendance Certificate',
    description: 'Issued to delegates who attended the event',
    audienceScope: 'delegate',
    eligibilityBasisType: 'registration',
    defaultVariables: [
      'full_name', 'salutation', 'designation', 'organization',
      'event_name', 'event_date', 'event_venue', 'registration_number',
      'certificate_number', 'issued_date',
    ],
    requiredVariables: ['full_name', 'event_name', 'certificate_number'],
    defaultFileNamePattern: '{{full_name}}-attendance-{{event_name}}.pdf',
    certificateNumberPrefix: 'ATT',
    requiresSessionAttendance: false,
  },

  faculty_participation: {
    type: 'faculty_participation',
    displayName: 'Faculty Participation Certificate',
    description: 'Issued to faculty who participated in any capacity',
    audienceScope: 'faculty',
    eligibilityBasisType: 'event_role',
    defaultVariables: [
      'full_name', 'salutation', 'designation', 'organization',
      'event_name', 'event_date', 'event_venue',
      'role_summary', 'session_list',
      'certificate_number', 'issued_date',
    ],
    requiredVariables: ['full_name', 'event_name', 'certificate_number'],
    defaultFileNamePattern: '{{full_name}}-faculty-{{event_name}}.pdf',
    certificateNumberPrefix: 'FAC',
    requiresSessionAttendance: false,
  },

  speaker_recognition: {
    type: 'speaker_recognition',
    displayName: 'Speaker Recognition Certificate',
    description: 'Issued to speakers for their presentations',
    audienceScope: 'speaker',
    eligibilityBasisType: 'session_assignment',
    defaultVariables: [
      'full_name', 'salutation', 'designation', 'organization',
      'event_name', 'event_date', 'event_venue',
      'session_title', 'session_date', 'session_time',
      'certificate_number', 'issued_date',
    ],
    requiredVariables: ['full_name', 'event_name', 'session_title', 'certificate_number'],
    defaultFileNamePattern: '{{full_name}}-speaker-{{event_name}}.pdf',
    certificateNumberPrefix: 'SPK',
    requiresSessionAttendance: false,
  },

  chairperson_recognition: {
    type: 'chairperson_recognition',
    displayName: 'Chairperson Recognition Certificate',
    description: 'Issued to chairpersons for their session leadership',
    audienceScope: 'chairperson',
    eligibilityBasisType: 'session_assignment',
    defaultVariables: [
      'full_name', 'salutation', 'designation', 'organization',
      'event_name', 'event_date', 'event_venue',
      'session_title', 'session_date', 'session_time',
      'certificate_number', 'issued_date',
    ],
    requiredVariables: ['full_name', 'event_name', 'session_title', 'certificate_number'],
    defaultFileNamePattern: '{{full_name}}-chairperson-{{event_name}}.pdf',
    certificateNumberPrefix: 'CHR',
    requiresSessionAttendance: false,
  },

  panelist_recognition: {
    type: 'panelist_recognition',
    displayName: 'Panelist Recognition Certificate',
    description: 'Issued to panelists for their discussion contributions',
    audienceScope: 'panelist',
    eligibilityBasisType: 'session_assignment',
    defaultVariables: [
      'full_name', 'salutation', 'designation', 'organization',
      'event_name', 'event_date', 'event_venue',
      'session_title', 'session_date', 'session_time',
      'certificate_number', 'issued_date',
    ],
    requiredVariables: ['full_name', 'event_name', 'session_title', 'certificate_number'],
    defaultFileNamePattern: '{{full_name}}-panelist-{{event_name}}.pdf',
    certificateNumberPrefix: 'PNL',
    requiresSessionAttendance: false,
  },

  moderator_recognition: {
    type: 'moderator_recognition',
    displayName: 'Moderator Recognition Certificate',
    description: 'Issued to moderators for their session facilitation',
    audienceScope: 'moderator',
    eligibilityBasisType: 'session_assignment',
    defaultVariables: [
      'full_name', 'salutation', 'designation', 'organization',
      'event_name', 'event_date', 'event_venue',
      'session_title', 'session_date', 'session_time',
      'certificate_number', 'issued_date',
    ],
    requiredVariables: ['full_name', 'event_name', 'session_title', 'certificate_number'],
    defaultFileNamePattern: '{{full_name}}-moderator-{{event_name}}.pdf',
    certificateNumberPrefix: 'MOD',
    requiresSessionAttendance: false,
  },

  cme_attendance: {
    type: 'cme_attendance',
    displayName: 'CME Attendance Certificate',
    description: 'Issued to attendees eligible for Continuing Medical Education credits',
    audienceScope: 'mixed',
    eligibilityBasisType: 'attendance',
    defaultVariables: [
      'full_name', 'salutation', 'designation', 'organization',
      'event_name', 'event_date', 'event_venue',
      'cme_credits', 'cme_provider', 'cme_activity_id',
      'sessions_attended', 'total_hours',
      'certificate_number', 'issued_date',
    ],
    requiredVariables: ['full_name', 'event_name', 'cme_credits', 'certificate_number'],
    defaultFileNamePattern: '{{full_name}}-cme-{{event_name}}.pdf',
    certificateNumberPrefix: 'CME',
    requiresSessionAttendance: true,
  },
};

export const CERTIFICATE_TYPE_CONFIGS: Record<CertificateType, CertificateTypeConfig> = Object.freeze(
  Object.fromEntries(
    Object.entries(RAW_CERTIFICATE_TYPE_CONFIGS).map(([type, config]) => [type, freezeCertificateConfig(config)]),
  ) as Record<CertificateType, CertificateTypeConfig>,
);

const VALID_CERTIFICATE_PREFIXES = new Set(
  Object.values(CERTIFICATE_TYPE_CONFIGS).map((config) => config.certificateNumberPrefix),
);

function assertValidCertificateSequence(sequence: number): void {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 99_999) {
    throw new Error('Invalid certificate sequence');
  }
}

function assertValidCertificateYear(year: number): void {
  if (!Number.isSafeInteger(year) || year < 1000 || year > 9999) {
    throw new Error('Invalid certificate year');
  }
}

/**
 * Get the config for a certificate type.
 */
export function getCertificateTypeConfig(type: CertificateType): CertificateTypeConfig {
  const config = CERTIFICATE_TYPE_CONFIGS[type];
  if (!config) throw new Error(`Unknown certificate type: ${type}`);
  return config;
}

/**
 * Get all certificate type configs as an array.
 */
export function getAllCertificateTypeConfigs(): CertificateTypeConfig[] {
  return Object.values(CERTIFICATE_TYPE_CONFIGS);
}

/**
 * Generate a certificate number for the given type and sequence.
 *
 * Format: GEM{YEAR}-{PREFIX}-{SEQUENCE}
 * Example: GEM2026-ATT-00412
 */
export function generateCertificateNumber(
  type: CertificateType,
  sequence: number,
  year?: number,
): string {
  const config = getCertificateTypeConfig(type);
  const y = year ?? new Date().getFullYear();
  assertValidCertificateYear(y);
  assertValidCertificateSequence(sequence);
  const seq = String(sequence).padStart(5, '0');
  return `GEM${y}-${config.certificateNumberPrefix}-${seq}`;
}

/**
 * Parse a certificate number to extract its components.
 * Returns null if the format doesn't match.
 */
export function parseCertificateNumber(certNumber: string): {
  year: number;
  prefix: string;
  sequence: number;
} | null {
  const match = certNumber.match(/^GEM(\d{4})-([A-Z]{3})-(\d{5})$/);
  if (!match) return null;
  if (!VALID_CERTIFICATE_PREFIXES.has(match[2])) return null;
  return {
    year: parseInt(match[1], 10),
    prefix: match[2],
    sequence: parseInt(match[3], 10),
  };
}
