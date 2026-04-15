import { describe, it, expect } from 'vitest';
import { createCmeVariablesSchema } from './certificate';

describe('CME variables Zod schema', () => {
  const maxHours = 12;
  const schema = createCmeVariablesSchema(maxHours);

  const validCme = {
    cme_credit_hours: 8,
    accrediting_body_name: 'Medical Council of India',
    accreditation_code: 'MCI-2026-001',
    cme_claim_text: 'This activity has been planned and implemented in accordance with MCI standards.',
  };

  it('accepts all four fields present and valid', () => {
    const result = schema.safeParse(validCme);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cme_credit_hours).toBe(8);
      expect(result.data.accrediting_body_name).toBe('Medical Council of India');
      expect(result.data.accreditation_code).toBe('MCI-2026-001');
      expect(result.data.cme_claim_text).toContain('MCI standards');
    }
  });

  it('rejects credit_hours > event duration', () => {
    const result = schema.safeParse({ ...validCme, cme_credit_hours: 13 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('cme_credit_hours');
    }
  });

  it('rejects missing cme_credit_hours', () => {
    const { cme_credit_hours, ...rest } = validCme;
    const result = schema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('cme_credit_hours');
    }
  });

  it('rejects missing accrediting_body_name', () => {
    const { accrediting_body_name, ...rest } = validCme;
    const result = schema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('accrediting_body_name');
    }
  });

  it('rejects missing accreditation_code', () => {
    const { accreditation_code, ...rest } = validCme;
    const result = schema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('accreditation_code');
    }
  });

  it('rejects missing cme_claim_text', () => {
    const { cme_claim_text, ...rest } = validCme;
    const result = schema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('cme_claim_text');
    }
  });

  it('rejects credit_hours = 0', () => {
    const result = schema.safeParse({ ...validCme, cme_credit_hours: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('cme_credit_hours');
    }
  });

  it('rejects credit_hours = negative', () => {
    const result = schema.safeParse({ ...validCme, cme_credit_hours: -1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('cme_credit_hours');
    }
  });

  it('rejects empty accrediting_body_name', () => {
    const result = schema.safeParse({ ...validCme, accrediting_body_name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty accreditation_code', () => {
    const result = schema.safeParse({ ...validCme, accreditation_code: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty cme_claim_text', () => {
    const result = schema.safeParse({ ...validCme, cme_claim_text: '' });
    expect(result.success).toBe(false);
  });

  it('accepts credit_hours exactly equal to event duration', () => {
    const result = schema.safeParse({ ...validCme, cme_credit_hours: 12 });
    expect(result.success).toBe(true);
  });

  it('accepts credit_hours = 0.5 (fractional)', () => {
    const result = schema.safeParse({ ...validCme, cme_credit_hours: 0.5 });
    expect(result.success).toBe(true);
  });
});
