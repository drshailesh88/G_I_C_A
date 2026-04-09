/**
 * WhatsApp Provider — Evolution API Adapter
 *
 * Implements WhatsAppProvider interface using Evolution API REST endpoints.
 * Reads EVOLUTION_API_BASE_URL and EVOLUTION_API_KEY from environment.
 *
 * Supports media attachments (document/image) via R2 signed URLs.
 */

import type { WhatsAppProvider, SendWhatsAppInput, ProviderSendResult, AttachmentDescriptor } from './types';
import { createR2Provider } from '@/lib/certificates/storage';
import { withTimeout, PROVIDER_TIMEOUTS } from './timeout';

const ATTACHMENT_URL_EXPIRY_SECONDS = 900; // 15 minutes

function getConfig() {
  const baseUrl = process.env.EVOLUTION_API_BASE_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!baseUrl) {
    throw new Error('EVOLUTION_API_BASE_URL environment variable is not set');
  }
  if (!apiKey) {
    throw new Error('EVOLUTION_API_KEY environment variable is not set');
  }
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey };
}

/** Determine media type from content type */
function getMediaType(contentType?: string): 'document' | 'image' {
  if (contentType?.startsWith('image/')) return 'image';
  return 'document';
}

export const evolutionWhatsAppProvider: WhatsAppProvider = {
  async sendText(input: SendWhatsAppInput): Promise<ProviderSendResult> {
    const { baseUrl, apiKey } = getConfig();

    // Evolution API expects the number without the leading '+'
    const number = input.toPhoneE164.replace(/^\+/, '');

    // If there are media attachments, send media message instead of text
    if (input.mediaAttachments && input.mediaAttachments.length > 0) {
      return sendMediaMessage(baseUrl, apiKey, number, input.body, input.mediaAttachments);
    }

    const response = await withTimeout(
      'evolution_api',
      PROVIDER_TIMEOUTS.EVOLUTION_WHATSAPP,
      async (signal) => fetch(`${baseUrl}/message/sendText`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
        },
        body: JSON.stringify({
          number,
          text: input.body,
        }),
        signal,
      }),
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown');
      return {
        provider: 'evolution_api',
        providerMessageId: null,
        accepted: false,
        rawStatus: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const data = await response.json() as {
      key?: { id?: string };
      status?: string;
      messageId?: string;
    };

    return {
      provider: 'evolution_api',
      providerMessageId: data?.key?.id ?? data?.messageId ?? null,
      providerConversationId: null,
      accepted: true,
      rawStatus: data?.status ?? 'accepted',
    };
  },
};

/** Sanitize a filename: extract basename, strip dangerous chars, enforce length */
function sanitizeFileName(name: string): string {
  let safe = name.replace(/\0/g, '');
  const lastSlash = Math.max(safe.lastIndexOf('/'), safe.lastIndexOf('\\'));
  if (lastSlash >= 0) safe = safe.slice(lastSlash + 1);
  safe = safe.replace(/\.\./g, '');
  safe = safe.replace(/^\.+/, '');
  if (safe.length > 255) safe = safe.slice(0, 255);
  return safe || 'attachment';
}

/** Validate attachment before sending */
function validateAttachment(att: AttachmentDescriptor): void {
  if (!att.storageKey || att.storageKey.includes('\0')) {
    throw new Error(`Invalid attachment storageKey: "${att.storageKey}"`);
  }
  if (!att.fileName) {
    throw new Error('Attachment fileName is required');
  }
}

/** Send a media message via Evolution API with R2 signed URL */
async function sendMediaMessage(
  baseUrl: string,
  apiKey: string,
  number: string,
  caption: string,
  attachments: AttachmentDescriptor[],
): Promise<ProviderSendResult> {
  const r2 = createR2Provider();

  // WhatsApp sends one media per message — warn if multiple
  if (attachments.length > 1) {
    console.warn(
      `[whatsapp] ${attachments.length} attachments provided, only first will be sent. WhatsApp supports one media per message.`,
    );
  }

  const att = attachments[0];
  validateAttachment(att);
  const signedUrl = await r2.getSignedUrl(att.storageKey, ATTACHMENT_URL_EXPIRY_SECONDS);
  const mediaType = getMediaType(att.contentType);

  const response = await withTimeout(
    'evolution_api',
    PROVIDER_TIMEOUTS.EVOLUTION_WHATSAPP,
    async (signal) => fetch(`${baseUrl}/message/sendMedia`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
      body: JSON.stringify({
        number,
        mediatype: mediaType,
        media: signedUrl,
        caption,
        fileName: sanitizeFileName(att.fileName),
      }),
      signal,
    }),
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown');
    return {
      provider: 'evolution_api',
      providerMessageId: null,
      accepted: false,
      rawStatus: `HTTP ${response.status}: ${errorText}`,
    };
  }

  const data = await response.json() as {
    key?: { id?: string };
    status?: string;
    messageId?: string;
  };

  return {
    provider: 'evolution_api',
    providerMessageId: data?.key?.id ?? data?.messageId ?? null,
    providerConversationId: null,
    accepted: true,
    rawStatus: data?.status ?? 'accepted',
  };
}
