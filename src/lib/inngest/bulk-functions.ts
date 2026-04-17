/**
 * Inngest Bulk Operation Functions — Req 8A-2
 *
 * Moves long-running bulk operations to Inngest step functions:
 * - Bulk certificate generation: step.run() per batch of 50
 * - Bulk email notifications: step.run() per batch of 20 + step.sleep('30s')
 * - Bulk WhatsApp notifications: step.run() per message + step.sleep('2s')
 * - Archive generation: steps per export type
 *
 * Each step is independently retryable (max 3 retries).
 * Completed batches are persisted even if later batches fail.
 */

import { inngest } from './client';
import { db } from '@/lib/db';
import { issuedCertificates, certificateTemplates, people, eventRegistrations, sessionAssignments, attendanceRecords, eventPeople } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { withEventScope } from '@/lib/db/with-event-scope';
import { findCurrentCertificate, buildSupersessionChain, getNextSequence, type IssuedCertificateRecord } from '@/lib/certificates/issuance-utils';
import { generateCertificateNumber, getCertificateTypeConfig } from '@/lib/certificates/certificate-types';
import { buildCertificateStorageKey, createR2Provider, type StorageUploadResult } from '@/lib/certificates/storage';
import { createBulkGenerationRedisClient, writeBulkCertificateGenerationSummary } from '@/lib/certificates/bulk-generation-state';
import { buildLockKey } from '@/lib/certificates/distributed-lock';
import { CERTIFICATE_TYPES, ELIGIBILITY_BASIS_TYPES } from '@/lib/validations/certificate';
import { eventIdSchema } from '@/lib/validations/event';
import type { BulkCertificateGenerateData, BulkCertificateNotifyData, ArchiveGenerateData } from './events';
import { z } from 'zod';

// ── Helpers ──────────────────────────────────────────────────

/** Split array into chunks of given size (exported for testing) */
export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

type Recipient = {
  id: string;
  fullName: string;
  email: string | null;
  designation: string | null;
};

type TemplateSetup = {
  template: {
    id: string;
    certificateType: string;
    versionNo: number;
    templateJson: unknown;
    brandingSnapshotJson: unknown;
  } | null;
  recipients: Recipient[];
  eligibilityBasisType: string;
};

type ExistingCertsData = {
  existingCerts: IssuedCertificateRecord[];
  numbers: string[];
};

type RenderableCertificate = {
  id: string;
  storageKey: string;
  certificateNumber: string;
  renderedVariables: Record<string, string>;
};

type PreparedNewCertificate = RenderableCertificate & {
  personId: string;
  uploadResult: StorageUploadResult;
  supersedesId: string | null;
};

type ExistingBatchCertificate = IssuedCertificateRecord & {
  templateId: string | null;
  templateVersionNo: number | null;
  certificateNumber: string;
  storageKey: string | null;
};

type CertRecord = {
  id: string;
  certificateNumber: string;
  certificateType: string;
  storageKey: string | null;
  personId: string;
  personFullName: string;
  personEmail: string | null;
  personPhone: string | null;
};

type StepRunner = {
  run<T>(name: string, fn: () => Promise<T>): Promise<T>;
  sleep(name: string, duration: string): Promise<void>;
};

type BulkScope = 'all' | { ids: string[] };

const RECIPIENT_TYPES = [
  'all_delegates',
  'all_faculty',
  'all_attendees',
  'custom',
] as const;
const BULK_NOTIFY_CHANNELS = ['email', 'whatsapp', 'both'] as const;
const MAX_BULK_RECIPIENT_IDS = 500;
const MAX_BULK_CERTIFICATE_IDS = 500;
const MAX_BULK_USER_ID_LENGTH = 255;
const MAX_BULK_BATCH_ID_LENGTH = 255;
const MAX_BULK_LOCK_KEY_LENGTH = 255;

const trimmedNonEmptyStringSchema = z.string().trim().min(1);
const boundedIdArraySchema = z.array(trimmedNonEmptyStringSchema).min(1);
const boundedRecipientIdArraySchema = boundedIdArraySchema.max(MAX_BULK_RECIPIENT_IDS);
const boundedCertificateIdArraySchema = boundedIdArraySchema.max(MAX_BULK_CERTIFICATE_IDS);

const bulkScopeSchema = z.union([
  z.literal('all'),
  z.object({
    ids: boundedRecipientIdArraySchema,
  }),
]);

const bulkGenerateDataSchema = z.object({
  eventId: eventIdSchema,
  userId: trimmedNonEmptyStringSchema.max(MAX_BULK_USER_ID_LENGTH),
  batchId: trimmedNonEmptyStringSchema.max(MAX_BULK_BATCH_ID_LENGTH).optional(),
  lockKey: trimmedNonEmptyStringSchema.max(MAX_BULK_LOCK_KEY_LENGTH).optional(),
  certificateType: z.enum(CERTIFICATE_TYPES).optional(),
  scope: bulkScopeSchema.optional(),
  templateId: trimmedNonEmptyStringSchema.optional(),
  recipientType: z.enum(RECIPIENT_TYPES).optional(),
  personIds: boundedRecipientIdArraySchema.optional(),
  eligibilityBasisType: z.enum(ELIGIBILITY_BASIS_TYPES).optional(),
}).superRefine((value, ctx) => {
  if (!value.templateId && !value.certificateType) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['templateId'],
      message: 'Certificate template or type is required',
    });
  }

  if (!value.scope && !value.recipientType) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recipientType'],
      message: 'Recipient scope is required',
    });
  }

  if (value.personIds && value.recipientType !== 'custom') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['personIds'],
      message: 'personIds may only be provided for custom recipient selection',
    });
  }

  if (value.lockKey && !value.certificateType) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['certificateType'],
      message: 'certificateType is required when lockKey is provided',
    });
  }
});

const bulkNotifyDataSchema = z.object({
  eventId: eventIdSchema,
  certificateIds: boundedCertificateIdArraySchema,
  channel: z.enum(BULK_NOTIFY_CHANNELS),
});

const archiveGenerateDataSchema = z.object({
  eventId: eventIdSchema,
});

async function releaseBulkGenerationLock(lockKey: string | undefined): Promise<void> {
  if (!lockKey) return;

  const redis = createBulkGenerationRedisClient();
  if (!redis) {
    console.error('Bulk certificate generation completed but Redis is not configured for lock release');
    return;
  }

  try {
    await redis.del(lockKey);
  } catch (err) {
    console.error(`Failed to release bulk certificate generation lock ${lockKey}:`, err);
  }
}

function validateBulkGenerationLockKey(
  lockKey: string | undefined,
  eventId: string,
  certificateType: string | undefined,
): string | undefined {
  if (!lockKey) {
    return undefined;
  }

  if (!certificateType) {
    throw new Error('certificateType is required when lockKey is provided');
  }

  const expectedLockKey = buildLockKey(eventId, certificateType);
  if (lockKey !== expectedLockKey) {
    throw new Error('Invalid bulk certificate generation lock key');
  }

  return expectedLockKey;
}

type BulkGenerationResult = {
  issued: number;
  skipped: number;
  certificateIds: string[];
  errors: string[];
};

async function storeBulkGenerationSummary(
  data: BulkCertificateGenerateData,
  result: BulkGenerationResult,
  total: number,
  status: 'completed' | 'failed' = 'completed',
): Promise<void> {
  if (!data.batchId) return;

  await writeBulkCertificateGenerationSummary({
    batch_id: data.batchId,
    event_id: data.eventId,
    status,
    total,
    issued: result.issued,
    skipped: result.skipped,
    certificate_ids: result.certificateIds,
    errors: result.errors,
    completed_at: new Date().toISOString(),
  });
}

function isBulkScope(value: unknown): value is BulkScope {
  return value === 'all' || (!!value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as { ids?: unknown }).ids));
}

async function renderCertificatePdf(template: unknown, renderedVariables: Record<string, string>): Promise<Buffer> {
  const { generate } = await import('@pdfme/generator');
  const { text, image, line, rectangle, ellipse, barcodes } = await import('@pdfme/schemas');

  const pdf = await generate({
    template: template as Parameters<typeof generate>[0]['template'],
    inputs: [renderedVariables],
    plugins: { text, image, line, rectangle, ellipse, ...barcodes },
  });

  return Buffer.from(pdf);
}

async function cleanupUploadedFiles(storageProvider: ReturnType<typeof createR2Provider>, storageKeys: string[]): Promise<void> {
  await Promise.all(
    storageKeys.map(async (storageKey) => {
      try {
        await storageProvider.delete(storageKey);
      } catch {
        // Best-effort cleanup after a failed DB transaction.
      }
    }),
  );
}

// ── 1. Bulk Certificate Generation ──────────────────────────

export const bulkCertificateGenerateFn = inngest.createFunction(
  {
    id: 'bulk-certificate-generate',
    retries: 3,
    concurrency: [{ key: 'event.data.eventId', limit: 1 }],
    triggers: [{ event: 'bulk/certificates.generate' }],
  },
  async ({ event, step }: { event: { data: BulkCertificateGenerateData }; step: StepRunner }) => {
    const data = bulkGenerateDataSchema.parse(event.data);
    const { eventId, userId } = data;
    const lockKey = validateBulkGenerationLockKey(data.lockKey, eventId, data.certificateType);
    const eligibilityBasisType = data.eligibilityBasisType ?? 'manual';

    try {
      // Step 1: Load template and recipients
      const setup: TemplateSetup = await step.run('load-template-and-recipients', async (): Promise<TemplateSetup> => {
        if (!data.templateId && !data.certificateType) {
          throw new Error('Certificate template or type is required');
        }
        const templateFilter = data.templateId ? eq(certificateTemplates.id, data.templateId) : eq(certificateTemplates.certificateType, data.certificateType as string);
        const [template] = await db
          .select()
          .from(certificateTemplates)
          .where(withEventScope(certificateTemplates.eventId, eventId, and(templateFilter, eq(certificateTemplates.status, 'active'))!))
          .limit(1);
        if (!template) throw new Error('Active certificate template not found');

        let recipients: Recipient[];

        if (isBulkScope(data.scope)) {
          if (data.scope === 'all') {
            recipients = await db
              .select({
                id: people.id,
                fullName: people.fullName,
                email: people.email,
                designation: people.designation,
              })
              .from(eventPeople)
              .innerJoin(people, eq(eventPeople.personId, people.id))
              .where(eq(eventPeople.eventId, eventId));
          } else if (data.scope.ids.length === 0) {
            return { template: null, recipients: [], eligibilityBasisType };
          } else {
            recipients = await db
              .select({
                id: people.id,
                fullName: people.fullName,
                email: people.email,
                designation: people.designation,
              })
              .from(people)
              .innerJoin(eventPeople, eq(eventPeople.personId, people.id))
              .where(and(eq(eventPeople.eventId, eventId), inArray(people.id, data.scope.ids))!);
          }
        } else {
          switch (data.recipientType) {
            case 'all_delegates': {
              recipients = await db
                .select({
                  id: people.id,
                  fullName: people.fullName,
                  email: people.email,
                  designation: people.designation,
                })
                .from(eventRegistrations)
                .innerJoin(people, eq(eventRegistrations.personId, people.id))
                .where(withEventScope(eventRegistrations.eventId, eventId, and(eq(eventRegistrations.status, 'confirmed'), eq(eventRegistrations.category, 'delegate'))!));
              break;
            }
            case 'all_faculty': {
              recipients = await db
                .selectDistinctOn([sessionAssignments.personId], {
                  id: people.id,
                  fullName: people.fullName,
                  email: people.email,
                  designation: people.designation,
                })
                .from(sessionAssignments)
                .innerJoin(people, eq(sessionAssignments.personId, people.id))
                .where(eq(sessionAssignments.eventId, eventId));
              break;
            }
            case 'all_attendees': {
              recipients = await db
                .selectDistinctOn([attendanceRecords.personId], {
                  id: people.id,
                  fullName: people.fullName,
                  email: people.email,
                  designation: people.designation,
                })
                .from(attendanceRecords)
                .innerJoin(people, eq(attendanceRecords.personId, people.id))
                .where(eq(attendanceRecords.eventId, eventId));
              break;
            }
            case 'custom': {
              if (!data.personIds || data.personIds.length === 0)
                return {
                  template: null,
                  recipients: [],
                  eligibilityBasisType,
                };
              // Defense-in-depth: join with eventPeople to enforce eventId scoping
              // even though custom personIds should already be event-scoped from UI
              recipients = await db
                .select({
                  id: people.id,
                  fullName: people.fullName,
                  email: people.email,
                  designation: people.designation,
                })
                .from(people)
                .innerJoin(eventPeople, eq(eventPeople.personId, people.id))
                .where(and(eq(eventPeople.eventId, eventId), inArray(people.id, data.personIds))!);
              break;
            }
            default:
              throw new Error('Invalid bulk certificate generation recipient scope');
          }
        }

        // Deduplicate
        const seen = new Set<string>();
        const deduped = recipients.filter((r) => {
          if (seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        });

        return {
          template: {
            id: template.id,
            certificateType: template.certificateType,
            versionNo: template.versionNo,
            templateJson: template.templateJson,
            brandingSnapshotJson: template.brandingSnapshotJson,
          },
          recipients: deduped,
          eligibilityBasisType,
        };
      });

      if (!setup.template || setup.recipients.length === 0) {
        const result = {
          issued: 0,
          skipped: 0,
          certificateIds: [] as string[],
          errors: [] as string[],
        };
        await storeBulkGenerationSummary(data, result, setup.recipients.length);
        return result;
      }

      const template = setup.template;
      const certType = template.certificateType as import('@/lib/validations/certificate').CertificateType;
      const config = getCertificateTypeConfig(certType);

      // Step 2: Load existing certificates and numbers
      // Note: step.run serializes return values through JSON (Inngest memoization),
      // so we store the raw data and cast when needed.
      const existing: ExistingCertsData = await step.run('load-existing-certs', async (): Promise<ExistingCertsData> => {
        const existingCerts = await db
          .select()
          .from(issuedCertificates)
          .where(withEventScope(issuedCertificates.eventId, eventId, eq(issuedCertificates.certificateType, template.certificateType)));

        const existingNumbers = await db.select({ certificateNumber: issuedCertificates.certificateNumber }).from(issuedCertificates).where(eq(issuedCertificates.eventId, eventId));

        return {
          existingCerts,
          numbers: existingNumbers.map((r) => r.certificateNumber),
        };
      });

      // Step 3: Process in batches of 50
      const batches = chunk(setup.recipients, 50);
      const allCertificateIds: string[] = [];
      const allErrors: string[] = [];
      let nextSeq = getNextSequence(existing.numbers, config.certificateNumberPrefix);

      for (let i = 0; i < batches.length; i++) {
        const batch: Recipient[] = batches[i];
        const batchStartSeq = nextSeq;

        const batchResult = await step.run(
          `generate-batch-${i + 1}`,
          async (): Promise<{
            certificateIds: string[];
            nextSeq: number;
            errors: string[];
          }> => {
            const storageProvider = createR2Provider();
            const certificateIds: string[] = [];
            const errors: string[] = [];
            const batchPersonIds = batch.map((recipient) => recipient.id);
            const batchExistingCerts = await db
              .select({
                id: issuedCertificates.id,
                eventId: issuedCertificates.eventId,
                personId: issuedCertificates.personId,
                templateId: issuedCertificates.templateId,
                templateVersionNo: issuedCertificates.templateVersionNo,
                certificateType: issuedCertificates.certificateType,
                certificateNumber: issuedCertificates.certificateNumber,
                status: issuedCertificates.status,
                supersededById: issuedCertificates.supersededById,
                supersedesId: issuedCertificates.supersedesId,
                revokedAt: issuedCertificates.revokedAt,
                revokeReason: issuedCertificates.revokeReason,
                storageKey: issuedCertificates.storageKey,
              })
              .from(issuedCertificates)
              .where(withEventScope(issuedCertificates.eventId, eventId, and(eq(issuedCertificates.certificateType, template.certificateType), inArray(issuedCertificates.personId, batchPersonIds))!));

            const freshNumbers = await db
              .select({
                certificateNumber: issuedCertificates.certificateNumber,
              })
              .from(issuedCertificates)
              .where(eq(issuedCertificates.eventId, eventId));

            const numbersInUse = new Set(freshNumbers.map((row) => row.certificateNumber));
            let seq = Math.max(
              batchStartSeq,
              getNextSequence(
                freshNumbers.map((row) => row.certificateNumber),
                config.certificateNumberPrefix,
              ),
            );

            for (const recipient of batch) {
              try {
                const currentCert = findCurrentCertificate(batchExistingCerts as ExistingBatchCertificate[], recipient.id, eventId, template.certificateType) as ExistingBatchCertificate | null;

                const renderedVariables: Record<string, string> = {
                  full_name: recipient.fullName,
                  recipient_name: recipient.fullName,
                  designation: recipient.designation ?? '',
                  email: recipient.email ?? '',
                };

                if (currentCert && currentCert.templateId === template.id && currentCert.templateVersionNo === template.versionNo) {
                  renderedVariables.certificate_number = currentCert.certificateNumber;

                  const pdfBuffer = await renderCertificatePdf(template.templateJson, renderedVariables);
                  const storageKey = currentCert.storageKey ?? buildCertificateStorageKey(eventId, template.certificateType, currentCert.id);
                  const uploadResult = await storageProvider.upload(storageKey, pdfBuffer, 'application/pdf');

                  await db
                    .update(issuedCertificates)
                    .set({
                      fileSizeBytes: uploadResult.fileSizeBytes,
                      fileChecksumSha256: uploadResult.fileChecksumSha256,
                      updatedAt: new Date(),
                    })
                    .where(withEventScope(issuedCertificates.eventId, eventId, eq(issuedCertificates.id, currentCert.id)));
                  certificateIds.push(currentCert.id);
                  continue;
                }

                const chain = buildSupersessionChain(currentCert);
                let certificateNumber = generateCertificateNumber(certType, seq);
                while (numbersInUse.has(certificateNumber)) {
                  seq++;
                  certificateNumber = generateCertificateNumber(certType, seq);
                }
                numbersInUse.add(certificateNumber);
                seq++;
                renderedVariables.certificate_number = certificateNumber;

                const certId = crypto.randomUUID();
                const storageKey = buildCertificateStorageKey(eventId, template.certificateType, certId);
                const pdfBuffer = await renderCertificatePdf(template.templateJson, renderedVariables);
                const uploadResult = await storageProvider.upload(storageKey, pdfBuffer, 'application/pdf');

                await db.transaction(async (tx) => {
                  const [newCert] = await tx
                    .insert(issuedCertificates)
                    .values({
                      id: certId,
                      eventId,
                      personId: recipient.id,
                      templateId: template.id,
                      templateVersionNo: template.versionNo,
                      certificateType: template.certificateType,
                      eligibilityBasisType,
                      certificateNumber,
                      storageKey,
                      fileName: `${certificateNumber}.pdf`,
                      fileSizeBytes: uploadResult.fileSizeBytes,
                      fileChecksumSha256: uploadResult.fileChecksumSha256,
                      renderedVariablesJson: renderedVariables,
                      brandingSnapshotJson: template.brandingSnapshotJson,
                      templateSnapshotJson: template.templateJson,
                      supersedesId: chain.newCertLink?.supersedesId || null,
                      issuedBy: userId,
                    })
                    .returning();

                  if (chain.newCertLink?.supersedesId) {
                    await tx
                      .update(issuedCertificates)
                      .set({
                        status: 'superseded',
                        supersededById: newCert.id,
                        updatedAt: new Date(),
                      })
                      .where(withEventScope(issuedCertificates.eventId, eventId, eq(issuedCertificates.id, chain.newCertLink.supersedesId)));
                  }

                  certificateIds.push(newCert.id);
                });
              } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                errors.push(`${recipient.id}: ${msg}`);
              }
            }

            return { certificateIds, nextSeq: seq, errors };
          },
        );

        allCertificateIds.push(...batchResult.certificateIds);
        allErrors.push(...batchResult.errors);
        nextSeq = batchResult.nextSeq;
      }

      const result = {
        issued: allCertificateIds.length,
        skipped: setup.recipients.length - allCertificateIds.length,
        certificateIds: allCertificateIds,
        errors: allErrors,
      };
      await storeBulkGenerationSummary(data, result, setup.recipients.length);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await storeBulkGenerationSummary(
        data,
        {
          issued: 0,
          skipped: 0,
          certificateIds: [],
          errors: [msg],
        },
        0,
        'failed',
      );
      throw err;
    } finally {
      await releaseBulkGenerationLock(lockKey);
    }
  },
);

// ── 2. Bulk Certificate Notifications ───────────────────────

export const bulkCertificateNotifyFn = inngest.createFunction(
  {
    id: 'bulk-certificate-notify',
    retries: 3,
    concurrency: [{ key: 'event.data.eventId', limit: 1 }],
    triggers: [{ event: 'bulk/certificates.notify' }],
  },
  async ({ event, step }: { event: { data: BulkCertificateNotifyData }; step: StepRunner }) => {
    const data = bulkNotifyDataSchema.parse(event.data);
    const { eventId, certificateIds, channel } = data;

    // Step 1: Load certificate data
    const certs: CertRecord[] = await step.run('load-certificates', async (): Promise<CertRecord[]> => {
      return db
        .select({
          id: issuedCertificates.id,
          certificateNumber: issuedCertificates.certificateNumber,
          certificateType: issuedCertificates.certificateType,
          storageKey: issuedCertificates.storageKey,
          personId: issuedCertificates.personId,
          personFullName: people.fullName,
          personEmail: people.email,
          personPhone: people.phoneE164,
        })
        .from(issuedCertificates)
        .innerJoin(people, eq(issuedCertificates.personId, people.id))
        .where(withEventScope(issuedCertificates.eventId, eventId, and(inArray(issuedCertificates.id, certificateIds), eq(issuedCertificates.status, 'issued'))!));
    });

    const certsWithStorage = certs.filter((c: CertRecord) => c.storageKey);
    let sent = 0;
    let failed = 0;
    const sentCertIds: string[] = []; // Track only successfully sent certs

    const channels = channel === 'both' ? (['email', 'whatsapp'] as const) : ([channel] as const);
    const wantsEmail = channels.includes('email');
    const wantsWhatsApp = channels.includes('whatsapp');

    // Step 2: Send emails in batches of 20 with 30s sleep between batches
    if (wantsEmail) {
      const emailBatches = chunk(certsWithStorage, 20);
      for (let i = 0; i < emailBatches.length; i++) {
        const batchCerts = emailBatches[i];
        const batchResult = await step.run(
          `email-batch-${i + 1}`,
          async (): Promise<{
            sent: number;
            failed: number;
            sentIds: string[];
          }> => {
            const { sendNotification } = await import('@/lib/notifications/send');
            let batchSent = 0;
            let batchFailed = 0;
            const batchSentIds: string[] = [];

            for (const cert of batchCerts) {
              try {
                await sendNotification({
                  eventId,
                  personId: cert.personId,
                  channel: 'email',
                  templateKey: 'certificate_delivery',
                  triggerType: 'certificate.generated',
                  triggerEntityType: 'issued_certificate',
                  triggerEntityId: cert.id,
                  sendMode: 'manual',
                  idempotencyKey: `cert-send-${cert.id}-email`,
                  variables: {
                    full_name: cert.personFullName,
                    certificate_number: cert.certificateNumber,
                    certificate_type: cert.certificateType.replace(/_/g, ' '),
                    recipientEmail: cert.personEmail ?? '',
                    recipientPhoneE164: cert.personPhone ?? '',
                  },
                  attachments: [
                    {
                      storageKey: cert.storageKey!,
                      fileName: `${cert.certificateNumber}.pdf`,
                    },
                  ],
                });
                batchSent++;
                batchSentIds.push(cert.id);
              } catch {
                batchFailed++;
              }
            }

            return {
              sent: batchSent,
              failed: batchFailed,
              sentIds: batchSentIds,
            };
          },
        );

        sent += batchResult.sent;
        failed += batchResult.failed;
        sentCertIds.push(...batchResult.sentIds);

        // Rate limit: 30s sleep between email batches (except after last)
        if (i < emailBatches.length - 1) {
          await step.sleep(`email-cooldown-${i + 1}`, '30s');
        }
      }
    }

    // Step 3: Send WhatsApp messages one at a time with 2s sleep
    if (wantsWhatsApp) {
      for (let i = 0; i < certsWithStorage.length; i++) {
        const cert = certsWithStorage[i];
        const msgResult = await step.run(
          `whatsapp-msg-${i + 1}`,
          async (): Promise<{
            sent: number;
            failed: number;
            sentId: string | null;
          }> => {
            try {
              const { sendNotification } = await import('@/lib/notifications/send');
              await sendNotification({
                eventId,
                personId: cert.personId,
                channel: 'whatsapp',
                templateKey: 'certificate_delivery',
                triggerType: 'certificate.generated',
                triggerEntityType: 'issued_certificate',
                triggerEntityId: cert.id,
                sendMode: 'manual',
                idempotencyKey: `cert-send-${cert.id}-whatsapp`,
                variables: {
                  full_name: cert.personFullName,
                  certificate_number: cert.certificateNumber,
                  certificate_type: cert.certificateType.replace(/_/g, ' '),
                  recipientEmail: cert.personEmail ?? '',
                  recipientPhoneE164: cert.personPhone ?? '',
                },
                attachments: [
                  {
                    storageKey: cert.storageKey!,
                    fileName: `${cert.certificateNumber}.pdf`,
                  },
                ],
              });
              return { sent: 1, failed: 0, sentId: cert.id };
            } catch {
              return { sent: 0, failed: 1, sentId: null };
            }
          },
        );

        sent += msgResult.sent;
        failed += msgResult.failed;
        if (msgResult.sentId) sentCertIds.push(msgResult.sentId);

        // Rate limit: 2s sleep between WhatsApp messages (except after last)
        if (i < certsWithStorage.length - 1) {
          await step.sleep(`whatsapp-cooldown-${i + 1}`, '2s');
        }
      }
    }

    // Step 4: Update lastSentAt ONLY for successfully sent certs
    if (sentCertIds.length > 0) {
      const uniqueSentIds = [...new Set(sentCertIds)];
      await step.run('update-sent-timestamps', async () => {
        await db
          .update(issuedCertificates)
          .set({ lastSentAt: new Date(), updatedAt: new Date() })
          .where(withEventScope(issuedCertificates.eventId, eventId, inArray(issuedCertificates.id, uniqueSentIds)));
      });
    }

    return { sent, failed, total: certsWithStorage.length };
  },
);

// ── 3. Archive Generation ───────────────────────────────────

export const archiveGenerateFn = inngest.createFunction(
  {
    id: 'bulk-archive-generate',
    retries: 3,
    concurrency: [{ key: 'event.data.eventId', limit: 1 }],
    triggers: [{ event: 'bulk/archive.generate' }],
  },
  async ({ event, step }: { event: { data: ArchiveGenerateData }; step: StepRunner }) => {
    const data = archiveGenerateDataSchema.parse(event.data);
    const { eventId } = data;

    // Step 1: Generate agenda Excel
    const agendaBuffer = await step.run('generate-agenda', async (): Promise<string> => {
      const { generateAgendaExcel } = await import('@/lib/exports/archive');
      const buffer = await generateAgendaExcel(eventId);
      return buffer.toString('base64');
    });

    // Step 2: Generate notification log CSV
    const notifCsvBuffer = await step.run('generate-notification-csv', async (): Promise<string> => {
      const { generateNotificationLogCsv } = await import('@/lib/exports/archive');
      const buffer = await generateNotificationLogCsv(eventId);
      return buffer.toString('base64');
    });

    // Step 3: Collect certificate keys
    const certKeys = await step.run('collect-certificate-keys', async (): Promise<Array<{ storageKey: string; fileName: string }>> => {
      const { getCertificateStorageKeys } = await import('@/lib/exports/archive');
      return getCertificateStorageKeys(eventId);
    });

    // Step 4: Build and upload ZIP archive
    const result = await step.run('build-and-upload-archive', async () => {
      const archiver = (await import('archiver')).default;
      const { PassThrough } = await import('stream');
      const { createR2Provider } = await import('@/lib/certificates/storage');
      const { buildArchiveStorageKey } = await import('@/lib/exports/archive');

      const storageProvider = createR2Provider();
      const archive = archiver('zip', { zlib: { level: 6 } });
      const passThrough = new PassThrough();
      archive.on('error', (err: Error) => passThrough.destroy(err));
      archive.pipe(passThrough);

      let fileCount = 0;

      // Add agenda
      archive.append(Buffer.from(agendaBuffer, 'base64'), {
        name: 'agenda.xlsx',
      });
      fileCount++;

      // Add notification log
      archive.append(Buffer.from(notifCsvBuffer, 'base64'), {
        name: 'notification-log.csv',
      });
      fileCount++;

      // Add certificates
      const usedNames = new Set<string>();
      for (const cert of certKeys) {
        try {
          const url = await storageProvider.getSignedUrl(cert.storageKey, 300);
          const res = await fetch(url);
          if (!res.ok) continue;
          const pdfBuffer = Buffer.from(await res.arrayBuffer());

          let name = cert.fileName.replace(/[/\\:*?"<>|]/g, '_').trim() || 'certificate.pdf';
          if (usedNames.has(name)) {
            const dotIdx = name.lastIndexOf('.');
            const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
            const ext = dotIdx > 0 ? name.slice(dotIdx) : '';
            let counter = 2;
            let candidate = `${base}-${counter}${ext}`;
            while (usedNames.has(candidate)) {
              counter++;
              candidate = `${base}-${counter}${ext}`;
            }
            name = candidate;
          }
          usedNames.add(name);

          archive.append(pdfBuffer, { name: `certificates/${name}` });
          fileCount++;
        } catch {
          continue;
        }
      }

      const archiveKey = buildArchiveStorageKey(eventId);
      let archiveSizeBytes = 0;
      const countBytes = (chunk: Buffer) => {
        archiveSizeBytes += chunk.length;
      };
      passThrough.on('data', countBytes);

      if (storageProvider.uploadStream) {
        const uploadPromise = storageProvider.uploadStream(archiveKey, passThrough, 'application/zip');
        await archive.finalize();
        const uploadResult = await uploadPromise;
        archiveSizeBytes = uploadResult.fileSizeBytes;
      } else {
        const chunks: Buffer[] = [];
        passThrough.on('data', (chunk: Buffer) => chunks.push(chunk));
        const endPromise = new Promise<void>((resolve, reject) => {
          passThrough.on('end', resolve);
          passThrough.on('error', reject);
        });

        await archive.finalize();
        await endPromise;
        const fullBuffer = Buffer.concat(chunks);
        archiveSizeBytes = fullBuffer.length;
        await storageProvider.upload(archiveKey, fullBuffer, 'application/zip');
      }

      const archiveUrl = await storageProvider.getSignedUrl(archiveKey, 3600);

      return {
        archiveStorageKey: archiveKey,
        archiveUrl,
        fileCount,
        archiveSizeBytes,
      };
    });

    return result;
  },
);

/** All bulk operation Inngest functions */
export const bulkInngestFunctions = [bulkCertificateGenerateFn, bulkCertificateNotifyFn, archiveGenerateFn];
