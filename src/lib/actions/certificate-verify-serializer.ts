const ALLOWED_KEYS = [
  'status',
  'certificate_number',
  'certificate_type',
  'person_name',
  'event_name',
  'issued_at',
  'revoked_at',
  'revoke_reason',
  'superseded_by_certificate_number',
] as const;

type VerifyResponseKey = typeof ALLOWED_KEYS[number];

export function serializeVerifyResponse(raw: Record<string, unknown>): Partial<Record<VerifyResponseKey, unknown>> {
  const result: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) {
    if (key in raw && raw[key] !== undefined && raw[key] !== null) {
      result[key] = raw[key];
    }
  }
  return result as Partial<Record<VerifyResponseKey, unknown>>;
}
