import { describe, expect, it } from 'vitest';
import { interpolate, resolvePath, validateRequiredVariables } from './template-utils';

describe('template-utils adversarial hardening', () => {
  it('blocks own __proto__ payloads parsed from JSON', () => {
    const variables = JSON.parse('{"__proto__":{"polluted":"yes"}}') as Record<string, unknown>;

    expect(resolvePath(variables, '__proto__.polluted')).toBeUndefined();
    expect(interpolate('Value: {{__proto__.polluted}}', variables)).toBe('Value: ');
  });

  it('blocks own constructor.prototype payloads parsed from JSON', () => {
    const variables = JSON.parse('{"constructor":{"prototype":{"polluted":"yes"}}}') as Record<string, unknown>;

    expect(resolvePath(variables, 'constructor.prototype.polluted')).toBeUndefined();
    expect(interpolate('Value: {{constructor.prototype.polluted}}', variables)).toBe('Value: ');
  });

  it('treats reserved-key required variables as missing even when present as own JSON properties', () => {
    const variables = JSON.parse('{"constructor":{"prototype":{"isAdmin":true}}}') as Record<string, unknown>;

    expect(
      validateRequiredVariables(['constructor.prototype.isAdmin'], variables),
    ).toEqual(['constructor.prototype.isAdmin']);
  });
});
