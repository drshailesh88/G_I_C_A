/**
 * Mutation-killing tests for template-utils.ts
 *
 * Targets: 5 survivors — ConditionalExpression in resolvePath,
 * LogicalOperator in resolvePath guard.
 */

import { describe, it, expect } from 'vitest';
import { interpolate, resolvePath, validateRequiredVariables } from './template-utils';

describe('resolvePath — edge cases', () => {
  it('returns undefined when obj is null at any level', () => {
    const obj = { a: null } as any;
    expect(resolvePath(obj, 'a.b')).toBeUndefined();
  });

  it('returns undefined when obj is undefined at any level', () => {
    const obj = { a: undefined } as any;
    expect(resolvePath(obj, 'a.b')).toBeUndefined();
  });

  it('returns undefined when intermediate is not an object', () => {
    const obj = { a: 42 } as any;
    expect(resolvePath(obj, 'a.b')).toBeUndefined();
  });

  it('returns undefined for property not on own object (prototype)', () => {
    const obj = Object.create({ inherited: 'value' });
    expect(resolvePath(obj, 'inherited')).toBeUndefined();
  });

  it('returns undefined for __proto__ access', () => {
    const obj = { normal: 'value' };
    expect(resolvePath(obj, '__proto__')).toBeUndefined();
  });

  it('returns undefined for constructor access', () => {
    const obj = { normal: 'value' };
    expect(resolvePath(obj, 'constructor')).toBeUndefined();
  });

  it('resolves deeply nested paths', () => {
    const obj = { a: { b: { c: { d: 'deep' } } } };
    expect(resolvePath(obj, 'a.b.c.d')).toBe('deep');
  });

  it('returns exact value for simple key', () => {
    const obj = { name: 'Alice' };
    expect(resolvePath(obj, 'name')).toBe('Alice');
  });

  it('returns false boolean value (not undefined)', () => {
    const obj = { active: false };
    expect(resolvePath(obj, 'active')).toBe(false);
  });

  it('returns 0 numeric value (not undefined)', () => {
    const obj = { count: 0 };
    expect(resolvePath(obj, 'count')).toBe(0);
  });

  it('returns empty string value (not undefined)', () => {
    const obj = { empty: '' };
    expect(resolvePath(obj, 'empty')).toBe('');
  });
});

describe('interpolate — mutation killing', () => {
  it('replaces null values with empty string', () => {
    const result = interpolate('Value: {{x}}', { x: null });
    expect(result).toBe('Value: ');
  });

  it('replaces undefined values with empty string', () => {
    const result = interpolate('Value: {{x}}', {});
    expect(result).toBe('Value: ');
  });

  it('converts boolean to string', () => {
    const result = interpolate('Active: {{active}}', { active: true });
    expect(result).toBe('Active: true');
  });

  it('does not replace non-matching patterns', () => {
    const result = interpolate('No {single} braces', {});
    expect(result).toBe('No {single} braces');
  });
});

describe('validateRequiredVariables — mutation killing', () => {
  it('returns empty array when all required variables present', () => {
    const missing = validateRequiredVariables(
      ['name', 'email'],
      { name: 'Alice', email: 'alice@example.com' },
    );
    expect(missing).toEqual([]);
  });

  it('returns missing variable names', () => {
    const missing = validateRequiredVariables(
      ['name', 'email', 'phone'],
      { name: 'Alice' },
    );
    expect(missing).toEqual(['email', 'phone']);
  });

  it('treats null values as missing', () => {
    const missing = validateRequiredVariables(
      ['name'],
      { name: null },
    );
    expect(missing).toEqual(['name']);
  });

  it('treats undefined values as missing', () => {
    const missing = validateRequiredVariables(
      ['name'],
      {},
    );
    expect(missing).toEqual(['name']);
  });

  it('treats empty string as present', () => {
    const missing = validateRequiredVariables(
      ['name'],
      { name: '' },
    );
    expect(missing).toEqual([]);
  });

  it('supports nested dot-notation variables', () => {
    const missing = validateRequiredVariables(
      ['branding.logoUrl'],
      { branding: { logoUrl: 'https://example.com/logo.png' } },
    );
    expect(missing).toEqual([]);
  });
});
