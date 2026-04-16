import { ROLES } from '@/lib/auth/roles';

export const CERTIFICATE_WRITE_ROLES: ReadonlySet<string> = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
]);

export class CertificateForbiddenError extends Error {
  readonly statusCode = 403;

  constructor() {
    super('forbidden');
    this.name = 'CertificateForbiddenError';
  }
}

export function assertCertificateWriteRole(role: string | null | undefined): asserts role is string {
  if (!role || !CERTIFICATE_WRITE_ROLES.has(role)) {
    throw new CertificateForbiddenError();
  }
}
