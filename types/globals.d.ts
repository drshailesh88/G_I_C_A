export {};

declare global {
  interface CustomJwtSessionClaims {
    metadata?: {
      appRole?: 'super_admin' | 'event_coordinator' | 'ops' | 'read_only';
    };
  }
}
