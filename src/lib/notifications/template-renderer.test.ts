import { describe, expect, it } from 'vitest';
import { interpolate, validateRequiredVariables } from './template-utils';

// ── interpolate ──────────────────────────────────────────────
describe('interpolate', () => {
  it('replaces simple variables', () => {
    const result = interpolate('Hello {{name}}, welcome!', { name: 'Alice' });
    expect(result).toBe('Hello Alice, welcome!');
  });

  it('replaces multiple variables', () => {
    const result = interpolate('{{greeting}} {{name}}, your event is {{eventName}}.', {
      greeting: 'Hi',
      name: 'Bob',
      eventName: 'GEM India 2026',
    });
    expect(result).toBe('Hi Bob, your event is GEM India 2026.');
  });

  it('handles nested dot-notation paths', () => {
    const result = interpolate('Dear {{person.fullName}}, your ID is {{person.id}}.', {
      person: { fullName: 'Dr. Sharma', id: '12345' },
    });
    expect(result).toBe('Dear Dr. Sharma, your ID is 12345.');
  });

  it('replaces missing variables with empty string', () => {
    const result = interpolate('Hello {{name}}, code: {{code}}', { name: 'Alice' });
    expect(result).toBe('Hello Alice, code: ');
  });

  it('replaces null variables with empty string', () => {
    const result = interpolate('Room: {{room}}', { room: null });
    expect(result).toBe('Room: ');
  });

  it('converts numbers to string', () => {
    const result = interpolate('Amount: {{amount}}', { amount: 42 });
    expect(result).toBe('Amount: 42');
  });

  it('handles deeply nested paths', () => {
    const result = interpolate('City: {{travel.from.city}}', {
      travel: { from: { city: 'Mumbai' } },
    });
    expect(result).toBe('City: Mumbai');
  });

  it('returns original template when no variables present', () => {
    const result = interpolate('No variables here.', {});
    expect(result).toBe('No variables here.');
  });

  it('handles template with only variables', () => {
    const result = interpolate('{{a}}{{b}}', { a: 'X', b: 'Y' });
    expect(result).toBe('XY');
  });

  it('does not replace partial matches or malformed placeholders', () => {
    const result = interpolate('{{ name }} {name} {{}}', { name: 'Alice' });
    expect(result).toBe('{{ name }} {name} {{}}');
  });
});

// ── validateRequiredVariables ────────────────────────────────
describe('validateRequiredVariables', () => {
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

  it('returns empty array with no required variables', () => {
    const missing = validateRequiredVariables([], { anything: 'value' });
    expect(missing).toEqual([]);
  });

  it('validates nested dot-notation variables', () => {
    const missing = validateRequiredVariables(
      ['person.fullName', 'person.email'],
      { person: { fullName: 'Alice' } },
    );
    expect(missing).toEqual(['person.email']);
  });

  it('treats empty string as present', () => {
    const missing = validateRequiredVariables(['name'], { name: '' });
    expect(missing).toEqual([]);
  });

  it('treats zero as present', () => {
    const missing = validateRequiredVariables(['count'], { count: 0 });
    expect(missing).toEqual([]);
  });

  it('treats false as present', () => {
    const missing = validateRequiredVariables(['flag'], { flag: false });
    expect(missing).toEqual([]);
  });
});
