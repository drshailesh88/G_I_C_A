import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('OWASP A05 — security headers', () => {
  it('sets a Content-Security-Policy header for all routes', () => {
    const nextConfigSource = fs.readFileSync(
      path.resolve(process.cwd(), 'next.config.ts'),
      'utf-8',
    );

    expect(nextConfigSource).toContain("key: 'Content-Security-Policy'");
    expect(nextConfigSource).toMatch(/source:\s*'\/\(\.\*\)'/);
  });
});
