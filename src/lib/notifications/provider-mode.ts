import { Redis } from '@upstash/redis';
import type {
  EmailProvider,
  WhatsAppProvider,
  SendEmailInput,
  SendWhatsAppInput,
  ProviderSendResult,
  Channel,
} from './types';

const MODE_KEY_PREFIX = 'test:provider-mode:';
const ATTEMPTS_KEY_PREFIX = 'test:provider-mode-attempts:';
const LAST_SENT_KEY_PREFIX = 'test:last-sent:';

function getTestRedis(): Redis | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL_TEST ??
    process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN_TEST ??
    process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function createProviderError(): Error {
  return new Error('Provider send failed: simulated failure');
}

async function checkModeAndMaybeThrow(
  redis: Redis,
  channel: Channel,
): Promise<void> {
  const mode = await redis.get<string>(`${MODE_KEY_PREFIX}${channel}`);
  if (!mode || mode === 'normal') return;

  if (mode === 'fail') {
    throw createProviderError();
  }

  if (mode.startsWith('failN:')) {
    const maxFails = parseInt(mode.split(':')[1], 10);
    const attemptsKey = `${ATTEMPTS_KEY_PREFIX}${channel}`;
    const attempts = await redis.incr(attemptsKey);
    if (attempts <= maxFails) {
      throw createProviderError();
    }
    await redis.del(attemptsKey);
    return;
  }

  if (mode.startsWith('flaky:')) {
    const rate = parseFloat(mode.split(':')[1]);
    if (Math.random() < rate) {
      throw createProviderError();
    }
  }
}

async function recordSentBody(
  redis: Redis,
  triggerId: string,
  channel: Channel,
  body: string,
): Promise<void> {
  await redis.set(`${LAST_SENT_KEY_PREFIX}${triggerId}:${channel}`, body, {
    ex: 3600,
  });
}

export function createShimmedEmailProvider(
  realProvider: EmailProvider,
): EmailProvider {
  return {
    async send(input: SendEmailInput): Promise<ProviderSendResult> {
      const redis = getTestRedis();
      if (redis) {
        const triggerId = input.metadata?.['x-trigger-id'];
        if (triggerId) {
          await recordSentBody(redis, triggerId, 'email', input.htmlBody);
        }
        await checkModeAndMaybeThrow(redis, 'email');
      }
      return realProvider.send(input);
    },
  };
}

export function createShimmedWhatsAppProvider(
  realProvider: WhatsAppProvider,
): WhatsAppProvider {
  return {
    async sendText(input: SendWhatsAppInput): Promise<ProviderSendResult> {
      const redis = getTestRedis();
      if (redis) {
        const triggerId = input.metadata?.['x-trigger-id'];
        if (triggerId) {
          await recordSentBody(redis, triggerId, 'whatsapp', input.body);
        }
        await checkModeAndMaybeThrow(redis, 'whatsapp');
      }
      return realProvider.sendText(input);
    },
  };
}
