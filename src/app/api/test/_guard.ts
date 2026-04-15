import { NextResponse } from 'next/server';

// Allow in test, explicit E2E_TEST_MODE, or development (never in production).
export function guard() {
  if (process.env.NODE_ENV === 'production' && process.env.E2E_TEST_MODE !== '1') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  return null;
}
