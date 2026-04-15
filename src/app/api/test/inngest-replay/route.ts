import { NextRequest, NextResponse } from 'next/server';
import { guard } from '../_guard';

// Inngest replay via REST requires the Inngest Cloud signing key + event id.
// Until the cascade-idempotency Phase 2c plumbing lands (captured events
// tracker), this endpoint returns 501.
export async function POST(_req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  return NextResponse.json({ error: 'not_implemented', note: 'Inngest replay requires Phase 2c captured-events store' }, { status: 501 });
}
