/**
 * Email Provider — Resend Adapter
 *
 * Implements EmailProvider interface using the Resend SDK.
 * Reads RESEND_API_KEY and RESEND_FROM_EMAIL from environment.
 */

import { Resend } from 'resend';
import type { EmailProvider, SendEmailInput, ProviderSendResult } from './types';

const DEFAULT_FROM = 'GEM India <noreply@gemindia.org>';

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }
  return new Resend(apiKey);
}

export const resendEmailProvider: EmailProvider = {
  async send(input: SendEmailInput): Promise<ProviderSendResult> {
    const resend = getResendClient();

    const fromAddress = input.fromDisplayName
      ? `${input.fromDisplayName} <${process.env.RESEND_FROM_EMAIL ?? 'noreply@gemindia.org'}>`
      : (process.env.RESEND_FROM_EMAIL
          ? `GEM India <${process.env.RESEND_FROM_EMAIL}>`
          : DEFAULT_FROM);

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: input.toEmail,
      subject: input.subject,
      html: input.htmlBody,
      text: input.textBody,
      headers: input.metadata,
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
