import { NextResponse } from 'next/server';

const TEST_MODE = process.env.NODE_ENV === 'test' || process.env.E2E_TEST_MODE === '1';

export function guard() {
  if (TEST_MODE) return null;
  return NextResponse.json({ error: 'Not Found' }, { status: 404 });
}
