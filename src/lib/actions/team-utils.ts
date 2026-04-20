import { ROLES } from '@/lib/auth/roles';

export type TeamMember = {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string;
  role: string;
  createdAt: number;
};

const ROLE_LABELS: Record<string, string> = {
  [ROLES.SUPER_ADMIN]: 'Super Admin',
  [ROLES.EVENT_COORDINATOR]: 'Event Coordinator',
  [ROLES.OPS]: 'Ops',
  [ROLES.READ_ONLY]: 'Read-only',
};

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
