import { NextRequest, NextResponse } from 'next/server';
import { guard } from '../_guard';

// TODO: audit_log table not yet implemented. Returns empty until schema added.
// Contracts depending on this endpoint (eventid-scoping CE12, certificates §20)
// will stay red until audit logging is wired.
export async function GET(_req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  return NextResponse.json([], { headers: { 'X-Test-Probe-Note': 'audit_log table not implemented yet' } });
}
