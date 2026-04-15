import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { people } from '@/lib/db/schema/people';
import { guard } from '../../_guard';

export async function POST(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const { person_id, full_name, email, phone_e164 } = await req.json();
  if (!person_id) return NextResponse.json({ error: 'person_id required' }, { status: 400 });
  const patch: Record<string, unknown> = { updatedAt: new Date(), updatedBy: 'system:test' };
  if (full_name !== undefined) patch.fullName = full_name;
  if (email !== undefined) patch.email = email;
  if (phone_e164 !== undefined) patch.phoneE164 = phone_e164;
  const [row] = await db.update(people).set(patch).where(eq(people.id, person_id)).returning();
  return NextResponse.json({ ok: true, row });
}
