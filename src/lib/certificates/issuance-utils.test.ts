import { describe, expect, it } from 'vitest';
import {
  findCurrentCertificate,
  buildSupersessionChain,
  validateRevocation,
  validateDownloadAccess,
  canIssueNewCertificate,
  checkEligibility,
  getNextSequence,
  planBulkGeneration,
  type IssuedCertificateRecord,
} from './issuance-utils';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PERSON_ID = '550e8400-e29b-41d4-a716-446655440001';
const CERT_ID = '550e8400-e29b-41d4-a716-446655440002';

function makeCert(overrides: Partial<IssuedCertificateRecord> = {}): IssuedCertificateRecord {
  return {
    id: CERT_ID,
    eventId: EVENT_ID,
    personId: PERSON_ID,
    certificateType: 'delegate_attendance',
    status: 'issued',
    supersededById: null,
    supersedesId: null,
    revokedAt: null,
    revokeReason: null,
    ...overrides,
  };
}

// ── findCurrentCertificate ───────────────────────────────────
describe('findCurrentCertificate', () => {
  it('returns the current issued certificate', () => {
    const certs = [makeCert()];
    const result = findCurrentCertificate(certs, PERSON_ID, EVENT_ID, 'delegate_attendance');
    expect(result?.id).toBe(CERT_ID);
  });

  it('returns null when no issued cert exists', () => {
    const certs = [makeCert({ status: 'revoked' })];
    const result = findCurrentCertificate(certs, PERSON_ID, EVENT_ID, 'delegate_attendance');
    expect(result).toBeNull();
  });

  it('returns null when cert is for different person', () => {
    const certs = [makeCert({ personId: 'other-person' })];
    const result = findCurrentCertificate(certs, PERSON_ID, EVENT_ID, 'delegate_attendance');
    expect(result).toBeNull();
  });

  it('returns null when cert is for different event', () => {
    const certs = [makeCert({ eventId: 'other-event' })];
    const result = findCurrentCertificate(certs, PERSON_ID, EVENT_ID, 'delegate_attendance');
    expect(result).toBeNull();
  });

  it('returns null when cert is for different type', () => {
    const certs = [makeCert({ certificateType: 'cme_attendance' })];
    const result = findCurrentCertificate(certs, PERSON_ID, EVENT_ID, 'delegate_attendance');
    expect(result).toBeNull();
  });

  it('ignores superseded certificates', () => {
    const certs = [makeCert({ status: 'superseded' })];
    const result = findCurrentCertificate(certs, PERSON_ID, EVENT_ID, 'delegate_attendance');
    expect(result).toBeNull();
  });

  it('returns null for empty list', () => {
    const result = findCurrentCertificate([], PERSON_ID, EVENT_ID, 'delegate_attendance');
    expect(result).toBeNull();
  });
});

// ── buildSupersessionChain ───────────────────────────────────
describe('buildSupersessionChain', () => {
  it('returns null chain when no existing cert', () => {
    const result = buildSupersessionChain(null);
    expect(result.oldCertUpdate).toBeNull();
    expect(result.newCertLink).toBeNull();
  });

  it('returns chain data for issued cert', () => {
    const result = buildSupersessionChain(makeCert());
    expect(result.oldCertUpdate).toEqual({ status: 'superseded', supersededById: '' });
    expect(result.newCertLink).toEqual({ supersedesId: CERT_ID });
  });

  it('returns null chain for revoked cert (cannot supersede)', () => {
    const result = buildSupersessionChain(makeCert({ status: 'revoked' }));
    expect(result.oldCertUpdate).toBeNull();
    expect(result.newCertLink).toBeNull();
  });
});

// ── validateRevocation ───────────────────────────────────────
describe('validateRevocation', () => {
  it('validates successful revocation', () => {
    const result = validateRevocation(makeCert(), 'Issued in error');
    expect(result.valid).toBe(true);
  });

  it('rejects empty reason', () => {
    const result = validateRevocation(makeCert(), '');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('reason is required');
  });

  it('rejects whitespace-only reason', () => {
    const result = validateRevocation(makeCert(), '   ');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('reason is required');
  });

  it('rejects already revoked cert', () => {
    const result = validateRevocation(makeCert({ status: 'revoked' }), 'Double revoke');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('already revoked');
  });

  it('rejects superseded cert', () => {
    const result = validateRevocation(makeCert({ status: 'superseded' }), 'Wrong version');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('superseded');
  });
});

// ── canIssueNewCertificate ───────────────────────────────────
describe('canIssueNewCertificate', () => {
  it('allows issuance when no existing cert', () => {
    const result = canIssueNewCertificate([], PERSON_ID, EVENT_ID, 'delegate_attendance', false);
    expect(result.canIssue).toBe(true);
  });

  it('allows issuance when will supersede existing', () => {
    const certs = [makeCert()];
    const result = canIssueNewCertificate(certs, PERSON_ID, EVENT_ID, 'delegate_attendance', true);
    expect(result.canIssue).toBe(true);
    expect(result.existingCertId).toBe(CERT_ID);
  });

  it('blocks issuance when existing cert and not superseding', () => {
    const certs = [makeCert()];
    const result = canIssueNewCertificate(certs, PERSON_ID, EVENT_ID, 'delegate_attendance', false);
    expect(result.canIssue).toBe(false);
    expect(result.reason).toContain('already has an active');
  });

  it('allows issuance when only revoked certs exist', () => {
    const certs = [makeCert({ status: 'revoked' })];
    const result = canIssueNewCertificate(certs, PERSON_ID, EVENT_ID, 'delegate_attendance', false);
    expect(result.canIssue).toBe(true);
  });

  it('allows issuance when only superseded certs exist', () => {
    const certs = [makeCert({ status: 'superseded' })];
    const result = canIssueNewCertificate(certs, PERSON_ID, EVENT_ID, 'delegate_attendance', false);
    expect(result.canIssue).toBe(true);
  });
});

// ── checkEligibility ─────────────────────────────────────────
describe('checkEligibility', () => {
  const fullContext = {
    hasConfirmedRegistration: true,
    hasEventAttendance: true,
    hasSessionAttendance: true,
    hasSessionAssignment: true,
    assignmentRoles: ['speaker', 'chairperson', 'panelist', 'moderator'],
    sessionAttendanceCount: 5,
  };

  it('delegate_attendance: eligible with registration + attendance', () => {
    const result = checkEligibility('delegate_attendance', fullContext);
    expect(result.eligible).toBe(true);
  });

  it('delegate_attendance: ineligible without registration', () => {
    const result = checkEligibility('delegate_attendance', { ...fullContext, hasConfirmedRegistration: false });
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('registration');
  });

  it('delegate_attendance: ineligible without attendance', () => {
    const result = checkEligibility('delegate_attendance', { ...fullContext, hasEventAttendance: false });
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('attendance');
  });

  it('faculty_participation: eligible with session assignments', () => {
    const result = checkEligibility('faculty_participation', fullContext);
    expect(result.eligible).toBe(true);
  });

  it('faculty_participation: ineligible without assignments', () => {
    const result = checkEligibility('faculty_participation', { ...fullContext, hasSessionAssignment: false });
    expect(result.eligible).toBe(false);
  });

  it('speaker_recognition: eligible with speaker role', () => {
    const result = checkEligibility('speaker_recognition', fullContext);
    expect(result.eligible).toBe(true);
  });

  it('speaker_recognition: ineligible without speaker role', () => {
    const result = checkEligibility('speaker_recognition', { ...fullContext, assignmentRoles: ['chairperson'] });
    expect(result.eligible).toBe(false);
  });

  it('chairperson_recognition: checks for chairperson role', () => {
    expect(checkEligibility('chairperson_recognition', fullContext).eligible).toBe(true);
    expect(checkEligibility('chairperson_recognition', { ...fullContext, assignmentRoles: [] }).eligible).toBe(false);
  });

  it('panelist_recognition: checks for panelist role', () => {
    expect(checkEligibility('panelist_recognition', fullContext).eligible).toBe(true);
    expect(checkEligibility('panelist_recognition', { ...fullContext, assignmentRoles: [] }).eligible).toBe(false);
  });

  it('moderator_recognition: checks for moderator role', () => {
    expect(checkEligibility('moderator_recognition', fullContext).eligible).toBe(true);
    expect(checkEligibility('moderator_recognition', { ...fullContext, assignmentRoles: [] }).eligible).toBe(false);
  });

  it('cme_attendance: eligible with session attendance', () => {
    const result = checkEligibility('cme_attendance', fullContext);
    expect(result.eligible).toBe(true);
  });

  it('cme_attendance: ineligible without session attendance', () => {
    const result = checkEligibility('cme_attendance', { ...fullContext, hasSessionAttendance: false });
    expect(result.eligible).toBe(false);
  });

  it('cme_attendance: ineligible with zero sessions', () => {
    const result = checkEligibility('cme_attendance', { ...fullContext, sessionAttendanceCount: 0 });
    expect(result.eligible).toBe(false);
  });

  // Adversarial: role-based eligibility requires actual session assignments
  it('speaker_recognition: ineligible with role claim but no session assignment', () => {
    const result = checkEligibility('speaker_recognition', {
      ...fullContext,
      hasSessionAssignment: false,
      assignmentRoles: ['speaker'],
    });
    expect(result.eligible).toBe(false);
  });

  it('chairperson_recognition: ineligible with role claim but no session assignment', () => {
    const result = checkEligibility('chairperson_recognition', {
      ...fullContext,
      hasSessionAssignment: false,
      assignmentRoles: ['chairperson'],
    });
    expect(result.eligible).toBe(false);
  });

  it('panelist_recognition: ineligible with role claim but no session assignment', () => {
    const result = checkEligibility('panelist_recognition', {
      ...fullContext,
      hasSessionAssignment: false,
    });
    expect(result.eligible).toBe(false);
  });

  it('moderator_recognition: ineligible with role claim but no session assignment', () => {
    const result = checkEligibility('moderator_recognition', {
      ...fullContext,
      hasSessionAssignment: false,
    });
    expect(result.eligible).toBe(false);
  });
});

// ── getNextSequence ──────────────────────────────────────────
describe('getNextSequence', () => {
  it('returns 1 for empty list', () => {
    expect(getNextSequence([], 'ATT')).toBe(1);
  });

  it('returns max + 1', () => {
    expect(getNextSequence(['GEM2026-ATT-00005', 'GEM2026-ATT-00003'], 'ATT')).toBe(6);
  });

  it('ignores different prefixes', () => {
    expect(getNextSequence(['GEM2026-FAC-00010', 'GEM2026-ATT-00003'], 'ATT')).toBe(4);
  });

  it('ignores malformed numbers', () => {
    expect(getNextSequence(['invalid', 'GEM2026-ATT-00002'], 'ATT')).toBe(3);
  });

  it('handles large sequences', () => {
    expect(getNextSequence(['GEM2026-ATT-99999'], 'ATT')).toBe(100000);
  });
});

// ── planBulkGeneration ───────────────────────────────────────
describe('planBulkGeneration', () => {
  const PERSON_A = '550e8400-e29b-41d4-a716-44665544000a';
  const PERSON_B = '550e8400-e29b-41d4-a716-44665544000b';
  const PERSON_C = '550e8400-e29b-41d4-a716-44665544000c';

  it('plans issuance for all persons when no existing certs', () => {
    const plan = planBulkGeneration(
      [PERSON_A, PERSON_B],
      EVENT_ID,
      'delegate_attendance',
      [],
      'ATT',
      [],
      2026,
    );
    expect(plan.toIssue).toHaveLength(2);
    expect(plan.toIssue[0].certificateNumber).toBe('GEM2026-ATT-00001');
    expect(plan.toIssue[1].certificateNumber).toBe('GEM2026-ATT-00002');
    expect(plan.toIssue[0].supersedes).toBeNull();
    expect(plan.skipped).toHaveLength(0);
  });

  it('plans supersession for persons with existing certs', () => {
    const existingCerts = [
      makeCert({ personId: PERSON_A, id: 'cert-a' }),
    ];
    const plan = planBulkGeneration(
      [PERSON_A, PERSON_B],
      EVENT_ID,
      'delegate_attendance',
      existingCerts,
      'ATT',
      ['GEM2026-ATT-00010'],
      2026,
    );
    expect(plan.toIssue).toHaveLength(2);
    expect(plan.toIssue[0].supersedes).toBe('cert-a');
    expect(plan.toIssue[1].supersedes).toBeNull();
    expect(plan.toIssue[0].certificateNumber).toBe('GEM2026-ATT-00011');
  });

  it('continues sequence from existing numbers', () => {
    const plan = planBulkGeneration(
      [PERSON_A],
      EVENT_ID,
      'delegate_attendance',
      [],
      'ATT',
      ['GEM2026-ATT-00050'],
      2026,
    );
    expect(plan.toIssue[0].certificateNumber).toBe('GEM2026-ATT-00051');
  });

  it('handles three persons with mixed existing states', () => {
    const existingCerts = [
      makeCert({ personId: PERSON_B, id: 'cert-b' }),
      makeCert({ personId: PERSON_C, id: 'cert-c', status: 'revoked' }), // revoked — doesn't count
    ];
    const plan = planBulkGeneration(
      [PERSON_A, PERSON_B, PERSON_C],
      EVENT_ID,
      'delegate_attendance',
      existingCerts,
      'ATT',
      [],
      2026,
    );
    expect(plan.toIssue).toHaveLength(3);
    expect(plan.toIssue[0].supersedes).toBeNull(); // A: no existing
    expect(plan.toIssue[1].supersedes).toBe('cert-b'); // B: supersedes
    expect(plan.toIssue[2].supersedes).toBeNull(); // C: revoked, doesn't count
  });
});

// ── validateDownloadAccess ──────────────────────────────────
describe('validateDownloadAccess', () => {
  it('allows download for issued certificate', () => {
    const cert = makeCert({ status: 'issued' });
    const result = validateDownloadAccess(cert);
    expect(result.allowed).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('blocks download for revoked certificate', () => {
    const cert = makeCert({ status: 'revoked' });
    const result = validateDownloadAccess(cert);
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('revoked');
  });

  it('blocks download for superseded certificate', () => {
    const cert = makeCert({ status: 'superseded' });
    const result = validateDownloadAccess(cert);
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('superseded');
  });

  it('blocks download when storageKey is empty string', () => {
    const cert = { ...makeCert(), storageKey: '' };
    const result = validateDownloadAccess(cert);
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('not been generated');
  });

  it('allows download when storageKey is present', () => {
    const cert = { ...makeCert(), storageKey: 'certificates/ev/type/id.pdf' };
    const result = validateDownloadAccess(cert);
    expect(result.allowed).toBe(true);
  });

  it('allows download when storageKey is not in the object (field not provided)', () => {
    const cert = makeCert();
    // storageKey is not on IssuedCertificateRecord, so it's undefined
    const result = validateDownloadAccess(cert);
    expect(result.allowed).toBe(true);
  });
});
