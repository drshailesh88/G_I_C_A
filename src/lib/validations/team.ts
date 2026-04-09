import { z } from 'zod';
import { ROLES } from '@/lib/auth/roles';

const VALID_ROLES = [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.OPS, ROLES.READ_ONLY] as const;

export const inviteMemberSchema = z.object({
  emailAddress: z.string().email('Invalid email address'),
  role: z.enum(VALID_ROLES, { message: 'Invalid role' }),
});

export const changeMemberRoleSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  role: z.enum(VALID_ROLES, { message: 'Invalid role' }),
});

export const removeMemberSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>;
export type RemoveMemberInput = z.infer<typeof removeMemberSchema>;
