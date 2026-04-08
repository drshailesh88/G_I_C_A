import { describe, expect, it } from 'vitest';
import {
  CERTIFICATE_TYPE_CONFIGS,
  getCertificateTypeConfig,
  getAllCertificateTypeConfigs,
  generateCertificateNumber,
  parseCertificateNumber,
} from './certificate-types';
import { CERTIFICATE_TYPES } from '@/lib/validations/certificate';

describe('CERTIFICATE_TYPE_CONFIGS', () => {
  it('has exactly 7 certificate types', () => {
    expect(Object.keys(CERTIFICATE_TYPE_CONFIGS)).toHaveLength(7);
  });

  it('covers all CERTIFICATE_TYPES from validation schema', () => {
    for (const type of CERTIFICATE_TYPES) {
      expect(CERTIFICATE_TYPE_CONFIGS[type]).toBeDefined();
      expect(CERTIFICATE_TYPE_CONFIGS[type].type).toBe(type);
    }
  });

  it('every type has required fields', () => {
    for (const config of Object.values(CERTIFICATE_TYPE_CONFIGS)) {
      expect(config.displayName).toBeTruthy();
      expect(config.description).toBeTruthy();
      expect(config.audienceScope).toBeTruthy();
      expect(config.eligibilityBasisType).toBeTruthy();
      expect(config.defaultVariables.length).toBeGreaterThan(0);
      expect(config.requiredVariables.length).toBeGreaterThan(0);
      expect(config.defaultFileNamePattern).toBeTruthy();
      expect(config.certificateNumberPrefix).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('every type includes certificate_number in required variables', () => {
    for (const config of Object.values(CERTIFICATE_TYPE_CONFIGS)) {
      expect(config.requiredVariables).toContain('certificate_number');
    }
  });

  it('every type includes full_name and event_name in required variables', () => {
    for (const config of Object.values(CERTIFICATE_TYPE_CONFIGS)) {
      expect(config.requiredVariables).toContain('full_name');
      expect(config.requiredVariables).toContain('event_name');
    }
  });

  it('required variables are a subset of default variables', () => {
    for (const config of Object.values(CERTIFICATE_TYPE_CONFIGS)) {
      for (const req of config.requiredVariables) {
        expect(config.defaultVariables).toContain(req);
      }
    }
  });

  it('certificate number prefixes are unique', () => {
    const prefixes = Object.values(CERTIFICATE_TYPE_CONFIGS).map(c => c.certificateNumberPrefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('only cme_attendance requires session attendance', () => {
    for (const config of Object.values(CERTIFICATE_TYPE_CONFIGS)) {
      if (config.type === 'cme_attendance') {
        expect(config.requiresSessionAttendance).toBe(true);
      } else {
        expect(config.requiresSessionAttendance).toBe(false);
      }
    }
  });
});

describe('getCertificateTypeConfig', () => {
  it('returns config for valid type', () => {
    const config = getCertificateTypeConfig('delegate_attendance');
    expect(config.type).toBe('delegate_attendance');
    expect(config.displayName).toBe('Delegate Attendance Certificate');
  });

  it('throws for unknown type', () => {
    expect(() => getCertificateTypeConfig('invalid' as any)).toThrow('Unknown certificate type');
  });
});

describe('getAllCertificateTypeConfigs', () => {
  it('returns all 7 configs', () => {
    const configs = getAllCertificateTypeConfigs();
    expect(configs).toHaveLength(7);
  });
});

describe('generateCertificateNumber', () => {
  it('generates correct format for delegate_attendance', () => {
    const num = generateCertificateNumber('delegate_attendance', 1, 2026);
    expect(num).toBe('GEM2026-ATT-00001');
  });

  it('generates correct format for faculty_participation', () => {
    const num = generateCertificateNumber('faculty_participation', 42, 2026);
    expect(num).toBe('GEM2026-FAC-00042');
  });

  it('generates correct format for speaker_recognition', () => {
    const num = generateCertificateNumber('speaker_recognition', 100, 2026);
    expect(num).toBe('GEM2026-SPK-00100');
  });

  it('generates correct format for chairperson_recognition', () => {
    const num = generateCertificateNumber('chairperson_recognition', 5, 2026);
    expect(num).toBe('GEM2026-CHR-00005');
  });

  it('generates correct format for panelist_recognition', () => {
    const num = generateCertificateNumber('panelist_recognition', 99, 2026);
    expect(num).toBe('GEM2026-PNL-00099');
  });

  it('generates correct format for moderator_recognition', () => {
    const num = generateCertificateNumber('moderator_recognition', 7, 2026);
    expect(num).toBe('GEM2026-MOD-00007');
  });

  it('generates correct format for cme_attendance', () => {
    const num = generateCertificateNumber('cme_attendance', 412, 2026);
    expect(num).toBe('GEM2026-CME-00412');
  });

  it('pads sequence to 5 digits', () => {
    expect(generateCertificateNumber('delegate_attendance', 1, 2026)).toMatch(/-00001$/);
    expect(generateCertificateNumber('delegate_attendance', 99999, 2026)).toMatch(/-99999$/);
  });

  it('uses current year when year not provided', () => {
    const num = generateCertificateNumber('delegate_attendance', 1);
    const year = new Date().getFullYear();
    expect(num).toContain(`GEM${year}`);
  });
});

describe('parseCertificateNumber', () => {
  it('parses valid certificate number', () => {
    const result = parseCertificateNumber('GEM2026-ATT-00412');
    expect(result).toEqual({ year: 2026, prefix: 'ATT', sequence: 412 });
  });

  it('parses all type prefixes', () => {
    const prefixes = ['ATT', 'FAC', 'SPK', 'CHR', 'PNL', 'MOD', 'CME'];
    for (const prefix of prefixes) {
      const result = parseCertificateNumber(`GEM2026-${prefix}-00001`);
      expect(result?.prefix).toBe(prefix);
    }
  });

  it('returns null for invalid format', () => {
    expect(parseCertificateNumber('invalid')).toBeNull();
    expect(parseCertificateNumber('GEM2026-AT-00001')).toBeNull(); // 2-char prefix
    expect(parseCertificateNumber('GEM2026-ATT-0001')).toBeNull(); // 4-digit seq
    expect(parseCertificateNumber('GEM26-ATT-00001')).toBeNull(); // 2-digit year
    expect(parseCertificateNumber('')).toBeNull();
  });

  it('roundtrips with generateCertificateNumber', () => {
    const num = generateCertificateNumber('cme_attendance', 412, 2026);
    const parsed = parseCertificateNumber(num);
    expect(parsed).toEqual({ year: 2026, prefix: 'CME', sequence: 412 });
  });
});
