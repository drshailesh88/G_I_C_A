import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { issuedCertificates as certificates } from '@/lib/db/schema/certificates';
import { guard } from '../../_guard';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guard(); if (blocked) return blocked;
  const { id } = await params;
  const [row] = await db.select().from(certificates).where(eq(certificates.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(row);
}
