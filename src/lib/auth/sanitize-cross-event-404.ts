import { NextResponse } from 'next/server';

const STANDARD_404_BODY = { error: 'Not Found' } as const;

const FORBIDDEN_TOKENS = ['access', 'permission', 'forbidden'];
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function sanitize404Body(body: unknown): { error: string } {
  if (!body || typeof body !== 'object') {
    return { ...STANDARD_404_BODY };
  }

  const serialized = JSON.stringify(body).toLowerCase();

  if (UUID_RE.test(serialized)) {
    return { ...STANDARD_404_BODY };
  }

  for (const token of FORBIDDEN_TOKENS) {
    if (serialized.includes(token)) {
      return { ...STANDARD_404_BODY };
    }
  }

  return { ...STANDARD_404_BODY };
}

export function crossEvent404Response(): NextResponse {
  return NextResponse.json(STANDARD_404_BODY, { status: 404 });
}
