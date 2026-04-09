import { z } from 'zod';

// ── Certificate types ────────────────────────────────────────
export const CERTIFICATE_TYPES = [
  'delegate_attendance',
  'faculty_participation',
  'speaker_recognition',
  'chairperson_recognition',
  'panelist_recognition',
  'moderator_recognition',
  'cme_attendance',
] as const;
export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

// ── Audience scopes ──────────────────────────────────────────
export const AUDIENCE_SCOPES = [
  'delegate',
  'faculty',
  'speaker',
  'chairperson',
  'panelist',
  'moderator',
  'mixed',
] as const;
export type AudienceScope = (typeof AUDIENCE_SCOPES)[number];

// ── Template statuses ────────────────────────────────────────
export const TEMPLATE_STATUSES = ['draft', 'active', 'archived'] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

// ── Page sizes ───────────────────────────────────────────────
export const PAGE_SIZES = ['A4_landscape', 'A4_portrait'] as const;
export const ORIENTATIONS = ['landscape', 'portrait'] as const;

// ── Certificate statuses ─────────────────────────────────────
export const CERTIFICATE_STATUSES = ['issued', 'superseded', 'revoked'] as const;
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];

// ── Eligibility basis types ──────────────────────────────────
export const ELIGIBILITY_BASIS_TYPES = [
  'registration',
  'attendance',
  'session_assignment',
  'event_role',
  'manual',
] as const;
export type EligibilityBasisType = (typeof ELIGIBILITY_BASIS_TYPES)[number];

// ── Create certificate template ──────────────────────────────
export const createCertificateTemplateSchema = z.object({
  templateName: z.string().trim().min(1, 'Template name is required').max(200),
  certificateType: z.enum(CERTIFICATE_TYPES),
  audienceScope: z.enum(AUDIENCE_SCOPES),
  templateJson: z.record(z.unknown()),
  pageSize: z.enum(PAGE_SIZES).default('A4_landscape'),
  orientation: z.enum(ORIENTATIONS).default('landscape'),
  allowedVariablesJson: z.array(z.string().trim().min(1, 'Variable name cannot be empty')).default([]),
  requiredVariablesJson: z.array(z.string().trim().min(1, 'Variable name cannot be empty')).default([]),
  defaultFileNamePattern: z.string().trim().max(500).optional(),
  signatureConfigJson: z.record(z.unknown()).optional(),
  brandingSnapshotJson: z.record(z.unknown()).optional(),
  qrVerificationEnabled: z.boolean().default(true),
  verificationText: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
}).refine(
  (data) => {
    const allowed = new Set(data.allowedVariablesJson);
    return data.requiredVariablesJson.every((v) => allowed.has(v));
  },
  { message: 'All required variables must be included in allowed variables', path: ['requiredVariablesJson'] },
);

export type CreateCertificateTemplateInput = z.infer<typeof createCertificateTemplateSchema>;

// ── Update certificate template ──────────────────────────────
export const updateCertificateTemplateSchema = z.object({
  templateId: z.string().uuid('Invalid template ID'),
  templateName: z.string().trim().min(1).max(200).optional(),
  templateJson: z.record(z.unknown()).optional(),
  pageSize: z.enum(PAGE_SIZES).optional(),
  orientation: z.enum(ORIENTATIONS).optional(),
  allowedVariablesJson: z.array(z.string().trim().min(1, 'Variable name cannot be empty')).optional(),
  requiredVariablesJson: z.array(z.string().trim().min(1, 'Variable name cannot be empty')).optional(),
  defaultFileNamePattern: z.string().trim().max(500).optional(),
  signatureConfigJson: z.record(z.unknown()).optional(),
  brandingSnapshotJson: z.record(z.unknown()).optional(),
  qrVerificationEnabled: z.boolean().optional(),
  verificationText: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type UpdateCertificateTemplateInput = z.infer<typeof updateCertificateTemplateSchema>;

// ── Activate template ────────────────────────────────────────
export const activateCertificateTemplateSchema = z.object({
  templateId: z.string().uuid('Invalid template ID'),
});

// ── Archive template ─────────────────────────────────────────
export const archiveCertificateTemplateSchema = z.object({
  templateId: z.string().uuid('Invalid template ID'),
});

// ── Status transitions ───────────────────────────────────────
export const TEMPLATE_STATUS_TRANSITIONS: Record<TemplateStatus, TemplateStatus[]> = {
  draft: ['active', 'archived'],
  active: ['archived'],
  archived: ['draft'], // can revert to draft for re-editing
};

// ── Issue certificate ────────────────────────────────────────
export const issueCertificateSchema = z.object({
  personId: z.string().uuid('Invalid person ID'),
  templateId: z.string().uuid('Invalid template ID'),
  certificateType: z.enum(CERTIFICATE_TYPES),
  eligibilityBasisType: z.enum(ELIGIBILITY_BASIS_TYPES),
  eligibilityBasisId: z.string().uuid().optional(),
  renderedVariablesJson: z.record(z.unknown()),
});

export type IssueCertificateInput = z.infer<typeof issueCertificateSchema>;

// ── Revoke certificate ───────────────────────────────────────
export const revokeCertificateSchema = z.object({
  certificateId: z.string().uuid('Invalid certificate ID'),
  revokeReason: z.string().trim().min(1, 'Revocation reason is required').max(2000),
});

export type RevokeCertificateInput = z.infer<typeof revokeCertificateSchema>;

// ── Bulk generation request ──────────────────────────────────
export const bulkGenerateSchema = z.object({
  templateId: z.string().uuid('Invalid template ID'),
  certificateType: z.enum(CERTIFICATE_TYPES),
  personIds: z.array(z.string().uuid()).min(1, 'At least one person required').max(500, 'Max 500 per batch'),
  eligibilityBasisType: z.enum(ELIGIBILITY_BASIS_TYPES),
});

export type BulkGenerateInput = z.infer<typeof bulkGenerateSchema>;
