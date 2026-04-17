import { describe, it, expect } from 'vitest';
import { TERMS_SECTIONS, PRIVACY_SECTIONS } from './page';

describe('PKT-C-001 terms page — static content contracts', () => {
  it('TERMS_SECTIONS has 6 sections', () => {
    expect(TERMS_SECTIONS).toHaveLength(6);
  });

  it('PRIVACY_SECTIONS has 6 sections', () => {
    expect(PRIVACY_SECTIONS).toHaveLength(6);
  });

  it('each terms section has a non-empty title and body', () => {
    for (const s of TERMS_SECTIONS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
    }
  });

  it('each privacy section has a non-empty title and body', () => {
    for (const s of PRIVACY_SECTIONS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
    }
  });

  it('terms section titles are unique', () => {
    const titles = TERMS_SECTIONS.map((s) => s.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('privacy section titles are unique', () => {
    const titles = PRIVACY_SECTIONS.map((s) => s.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
