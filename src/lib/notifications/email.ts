/**
 * Email Provider — Resend Adapter
 *
 * Implements EmailProvider interface using the Resend SDK.
 * Reads RESEND_API_KEY and RESEND_FROM_EMAIL from environment.
 *
 * Supports file attachments via R2 signed URLs.
 */

import { Resend } from 'resend';
import type { EmailProvider, SendEmailInput, ProviderSendResult, AttachmentDescriptor } from './types';
import { createR2Provider } from '@/lib/certificates/storage';
import { withTimeout, PROVIDER_TIMEOUTS } from './timeout';

const DEFAULT_FROM = 'GEM India <noreply@gemindia.org>';
const ATTACHMENT_URL_EXPIRY_SECONDS = 900; // 15 minutes
const FROM_DISPLAY_NAME_PATTERN = /^[\p{L}\p{N} .,'&()/_-]{1,120}$/u;
const CUSTOM_HEADER_NAME_PATTERN = /^x-[a-z0-9-]{1,64}$/i;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const MAX_CUSTOM_HEADER_VALUE_LENGTH = 256;
const EVENT_SCOPED_ATTACHMENT_ROOTS = new Set([
  'certificates',
  'branding',
  'events',
  'travel',
  'accommodation',
  'transport',
]);

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }
  return new Resend(apiKey);
}

/** Sanitize a filename: extract basename, strip dangerous chars, enforce length */
function sanitizeFileName(name: string): string {
  // Strip null bytes
  let safe = name.replace(/\0/g, '');
  // Extract just the basename (last segment after any / or \)
  const lastSlash = Math.max(safe.lastIndexOf('/'), safe.lastIndexOf('\\'));
  if (lastSlash >= 0) safe = safe.slice(lastSlash + 1);
  // Remove path traversal sequences
  safe = safe.replace(/\.\./g, '');
  // Remove leading dots to prevent hidden files
  safe = safe.replace(/^\.+/, '');
  // Enforce max length
  if (safe.length > 255) safe = safe.slice(0, 255);
  return safe || 'attachment';
}

/** Validate attachment descriptor before processing */
function validateAttachment(eventId: string, att: AttachmentDescriptor): void {
  if (!att.storageKey || att.storageKey.includes('\0')) {
    throw new Error(`Invalid attachment storageKey: "${att.storageKey}"`);
  }
  if (!att.fileName) {
    throw new Error('Attachment fileName is required');
  }
  assertAttachmentEventScope(eventId, att.storageKey);
}

function assertAttachmentEventScope(eventId: string, storageKey: string): void {
  const segments = storageKey.split('/');
  if (segments.length < 2) {
    return;
  }

  const [root, scopedEventId] = segments;
  if (
    EVENT_SCOPED_ATTACHMENT_ROOTS.has(root)
    && scopedEventId !== eventId
  ) {
    throw new Error('Attachment storageKey is outside the active event scope');
  }
}

function normalizeFromDisplayName(fromDisplayName: string | null | undefined): string | null {
  if (fromDisplayName == null) {
    return null;
  }

  if (
    fromDisplayName !== fromDisplayName.trim()
    || CONTROL_CHAR_PATTERN.test(fromDisplayName)
    || !FROM_DISPLAY_NAME_PATTERN.test(fromDisplayName)
  ) {
    throw new Error('Invalid from display name');
  }

  return fromDisplayName;
}

function normalizeCustomHeaders(
  metadata: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!metadata) {
    return undefined;
  }

  const sanitizedHeaders: Record<string, string> = {};

  for (const [name, value] of Object.entries(metadata)) {
    if (
      !CUSTOM_HEADER_NAME_PATTERN.test(name)
      || typeof value !== 'string'
      || value.length === 0
      || value !== value.trim()
      || value.length > MAX_CUSTOM_HEADER_VALUE_LENGTH
      || CONTROL_CHAR_PATTERN.test(name)
      || CONTROL_CHAR_PATTERN.test(value)
    ) {
      throw new Error('Invalid custom email header');
    }

    sanitizedHeaders[name] = value;
  }

  return sanitizedHeaders;
}

/** Resolve AttachmentDescriptor[] to Resend attachment format via R2 signed URLs */
async function resolveAttachments(
  eventId: string,
  attachments: AttachmentDescriptor[] | undefined,
): Promise<Array<{ filename: string; path: string }>> {
  if (!attachments || attachments.length === 0) return [];

  const r2 = createR2Provider();
  const resolved: Array<{ filename: string; path: string }> = [];

  for (const att of attachments) {
    validateAttachment(eventId, att);
    const signedUrl = await withTimeout(
      'r2_signed_url',
      PROVIDER_TIMEOUTS.R2_SIGNED_URL,
      async () => r2.getSignedUrl(att.storageKey, ATTACHMENT_URL_EXPIRY_SECONDS),
    );
    resolved.push({
      filename: sanitizeFileName(att.fileName),
      path: signedUrl,
    });
  }

  return resolved;
}

export const resendEmailProvider: EmailProvider = {
  async send(input: SendEmailInput): Promise<ProviderSendResult> {
    const resend = getResendClient();
    const fromDisplayName = normalizeFromDisplayName(input.fromDisplayName);
    const metadata = normalizeCustomHeaders(input.metadata);

    const fromAddress = fromDisplayName
      ? `${fromDisplayName} <${process.env.RESEND_FROM_EMAIL ?? 'noreply@gemindia.org'}>`
      : (process.env.RESEND_FROM_EMAIL
          ? `GEM India <${process.env.RESEND_FROM_EMAIL}>`
          : DEFAULT_FROM);

    const attachments = await resolveAttachments(input.eventId, input.attachments);

    const { data, error } = await withTimeout(
      'resend',
      PROVIDER_TIMEOUTS.RESEND_EMAIL,
      async () => resend.emails.send({
        from: fromAddress,
        to: input.toEmail,
        subject: input.subject,
        html: input.htmlBody,
        text: input.textBody,
        headers: metadata,
        ...(attachments.length > 0 ? { attachments } : {}),
      }),
    );

    if (error) {
      return {
        provider: 'resend',
        providerMessageId: null,
        accepted: false,
        rawStatus: error.message ?? 'unknown_error',
      };
    }

    return {
      provider: 'resend',
      providerMessageId: data?.id ?? null,
      accepted: true,
      rawStatus: 'accepted',
    };
  },
};
