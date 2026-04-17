import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
  });

  it('deduplicates Tailwind classes', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2');
  });

  it('ignores prototype-backed class dictionaries', () => {
    const prototype = { hidden: true };
    const classes = Object.create(prototype) as Record<string, boolean>;

    classes.visible = true;

    expect(cn(classes)).toBe('visible');
  });

  it('does not recurse forever on cyclic class arrays', () => {
    const cyclic: unknown[] = ['base'];

    cyclic.push(cyclic);
    cyclic.push('p-4');

    expect(cn(cyclic as Parameters<typeof cn>[0], 'p-2')).toBe('base p-2');
  });

  it('fails closed on deeply nested class arrays instead of overflowing the stack', () => {
    let nested: unknown[] = ['deep'];

    for (let index = 0; index < 20_000; index += 1) {
      nested = [nested];
    }

    expect(() => cn(nested as Parameters<typeof cn>[0], 'flex')).not.toThrow();
    expect(cn(nested as Parameters<typeof cn>[0], 'flex')).toBe('flex');
  });
});
