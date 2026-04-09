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

const DEFAULT_FROM = 'GEM India <noreply@gemindia.org>';
const ATTACHMENT_URL_EXPIRY_SECONDS = 900; // 15 minutes

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }
  return new Resend(apiKey);
}

/** Resolve AttachmentDescriptor[] to Resend attachment format via R2 signed URLs */
async function resolveAttachments(
  attachments: AttachmentDescriptor[] | undefined,
): Promise<Array<{ filename: string; path: string }>> {
  if (!attachments || attachments.length === 0) return [];

  const r2 = createR2Provider();
  const resolved: Array<{ filename: string; path: string }> = [];

  for (const att of attachments) {
    const signedUrl = await r2.getSignedUrl(att.storageKey, ATTACHMENT_URL_EXPIRY_SECONDS);
    resolved.push({
      filename: att.fileName,
      path: signedUrl,
    });
  }

  return resolved;
}

export const resendEmailProvider: EmailProvider = {
  async send(input: SendEmailInput): Promise<ProviderSendResult> {
    const resend = getResendClient();

    const fromAddress = input.fromDisplayName
      ? `${input.fromDisplayName} <${process.env.RESEND_FROM_EMAIL ?? 'noreply@gemindia.org'}>`
      : (process.env.RESEND_FROM_EMAIL
          ? `GEM India <${process.env.RESEND_FROM_EMAIL}>`
          : DEFAULT_FROM);

    const attachments = await resolveAttachments(input.attachments);

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: input.toEmail,
      subject: input.subject,
      html: input.htmlBody,
      text: input.textBody,
      headers: input.metadata,
      ...(attachments.length > 0 ? { attachments } : {}),
    });

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
