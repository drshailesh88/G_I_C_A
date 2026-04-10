import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const globalsPath = resolve(__dirname, 'globals.css');

function readGlobalsCss(): string {
  return readFileSync(globalsPath, 'utf-8');
}

describe('Fluid typography tokens in globals.css', () => {
  const fluidTokens = [
    '--font-size-xs',
    '--font-size-sm',
    '--font-size-base',
    '--font-size-lg',
    '--font-size-xl',
    '--font-size-2xl',
    '--font-size-3xl',
  ] as const;

  it('contains all 7 fluid type scale tokens in @theme block', () => {
    const css = readGlobalsCss();
    for (const token of fluidTokens) {
      expect(css).toContain(token);
    }
  });

  it('each fluid token uses a clamp() value', () => {
    const css = readGlobalsCss();
    for (const token of fluidTokens) {
      const regex = new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*clamp\\(`);
      expect(css).toMatch(regex);
    }
  });

  it('clamp values use rem and vw units', () => {
    const css = readGlobalsCss();
    // Extract all clamp() values
    const clampMatches = css.match(/clamp\([^)]+\)/g);
    expect(clampMatches).not.toBeNull();
    expect(clampMatches!.length).toBeGreaterThanOrEqual(7);

    for (const clamp of clampMatches!) {
      // Each clamp should have: min (rem), preferred (rem + vw), max (rem)
      expect(clamp).toMatch(/\d+(\.\d+)?rem/);
      expect(clamp).toMatch(/\d+(\.\d+)?vw/);
    }
  });

  it('tokens are inside the @theme block', () => {
    const css = readGlobalsCss();
    const themeMatch = css.match(/@theme\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/s);
    expect(themeMatch).not.toBeNull();
    const themeBlock = themeMatch![1];
    for (const token of fluidTokens) {
      expect(themeBlock).toContain(token);
    }
  });
});
