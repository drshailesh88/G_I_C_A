/**
 * WhatsApp Provider — Evolution API Adapter
 *
 * Implements WhatsAppProvider interface using Evolution API REST endpoints.
 * Reads EVOLUTION_API_BASE_URL and EVOLUTION_API_KEY from environment.
 */

import type { WhatsAppProvider, SendWhatsAppInput, ProviderSendResult } from './types';
import { withTimeout, PROVIDER_TIMEOUTS } from './timeout';

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

export const evolutionWhatsAppProvider: WhatsAppProvider = {
  async sendText(input: SendWhatsAppInput): Promise<ProviderSendResult> {
    const { baseUrl, apiKey } = getConfig();

    // Evolution API expects the number without the leading '+'
    const number = input.toPhoneE164.replace(/^\+/, '');

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
