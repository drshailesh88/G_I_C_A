import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function readJson(relativePath: string) {
  return JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf-8'),
  ) as {
    headers?: Array<{ headers?: Array<{ key?: string; value?: string }> }>;
  };
}

describe('OWASP A05 — security headers', () => {
  it('sets a Content-Security-Policy header for all routes', () => {
    const vercelConfig = readJson('vercel.json');
    const headerKeys = (vercelConfig.headers ?? [])
      .flatMap((entry) => entry.headers ?? [])
      .map((header) => header.key);

    expect(headerKeys).toContain('Content-Security-Policy');
  });
});
