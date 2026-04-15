import { describe, it, expect } from 'vitest';
import { crossEvent404Response, sanitize404Body } from './sanitize-cross-event-404';

describe('sanitize404Body', () => {
  it('strips identifying substrings and returns generic body', () => {
    const input = { error: 'Event abc-123 not accessible' };
    const output = sanitize404Body(input);
    expect(output).toEqual({ error: 'Not Found' });
  });

  it('strips eventId UUIDs from error messages', () => {
    const eventId = '550e8400-e29b-41d4-a716-446655440000';
    const input = { error: `Event ${eventId} not found` };
    const output = sanitize404Body(input);
    expect(output).toEqual({ error: 'Not Found' });
    expect(JSON.stringify(output)).not.toContain(eventId);
  });

  it('strips forbidden words: access, permission, forbidden', () => {
    for (const word of ['access', 'permission', 'forbidden']) {
      const input = { error: `You do not have ${word} to this resource` };
      const output = sanitize404Body(input);
      expect(output).toEqual({ error: 'Not Found' });
      expect(JSON.stringify(output)).not.toContain(word);
    }
  });

  it('passes through a clean { error: "Not Found" } unchanged', () => {
    const input = { error: 'Not Found' };
    const output = sanitize404Body(input);
    expect(output).toEqual({ error: 'Not Found' });
  });

  it('replaces null body with standard body', () => {
    const output = sanitize404Body(null);
    expect(output).toEqual({ error: 'Not Found' });
  });

  it('replaces undefined body with standard body', () => {
    const output = sanitize404Body(undefined);
    expect(output).toEqual({ error: 'Not Found' });
  });
});

describe('crossEvent404Response', () => {
  it('returns a Response with status 404 and standard body', async () => {
    const res = crossEvent404Response();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'Not Found' });
  });

  it('body contains no event-identifying information', async () => {
    const res = crossEvent404Response();
    const text = await res.clone().text();
    expect(text).not.toMatch(/access/i);
    expect(text).not.toMatch(/permission/i);
    expect(text).not.toMatch(/forbidden/i);
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});
