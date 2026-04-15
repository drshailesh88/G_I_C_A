import { NextResponse } from 'next/server';
import { z } from 'zod';
import { lookupAndVerify } from '@/lib/actions/certificate-verify';

type Params = Promise<{ token: string }>;

const tokenSchema = z.string().uuid('Invalid verification token');

export async function GET(
  _request: Request,
  { params }: { params: Params },
) {
  const { token } = await params;

  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }

  try {
    const result = await lookupAndVerify(parsed.data);

    if (!result) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
