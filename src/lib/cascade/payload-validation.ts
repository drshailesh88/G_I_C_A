import { NonRetriableError } from 'inngest';
import { cascadeEventDataSchema, type CascadeEventData } from './payload-schemas';
import { captureError } from '@/lib/sentry';

type ValidateCascadePayloadOptions = {
  inngestEventId?: string;
};

export function validateCascadePayload(
  cascadeEvent: string,
  rawData: unknown,
  options: ValidateCascadePayloadOptions = {},
): CascadeEventData {
  const result = cascadeEventDataSchema.safeParse(rawData);

  if (!result.success) {
    const zodIssues = result.error.issues;
    const { inngestEventId } = options;

    captureError(result.error, {
      module: 'cascade',
      tags: {
        kind: 'cascade-payload-invalid',
        cascade_event: cascadeEvent,
        ...(inngestEventId ? { inngestEventId } : {}),
      },
      extra: {
        rawPayload: rawData,
        zodIssues,
        cascadeEvent,
        ...(inngestEventId ? { inngestEventId } : {}),
      },
    });

    throw new NonRetriableError(
      `Cascade payload validation failed for ${cascadeEvent}: ${result.error.message}`,
    );
  }

  return result.data;
}
