import { NonRetriableError } from 'inngest';
import { cascadeEventDataSchema, type CascadeEventData } from './payload-schemas';
import { captureError } from '@/lib/sentry';

export function validateCascadePayload(
  cascadeEvent: string,
  rawData: unknown,
): CascadeEventData {
  const result = cascadeEventDataSchema.safeParse(rawData);

  if (!result.success) {
    const zodIssues = result.error.issues;

    captureError(result.error, {
      module: 'cascade',
      tags: {
        kind: 'cascade-payload-invalid',
        cascade_event: cascadeEvent,
      },
      extra: {
        rawPayload: rawData,
        zodIssues,
        cascadeEvent,
      },
    });

    throw new NonRetriableError(
      `Cascade payload validation failed for ${cascadeEvent}: ${result.error.message}`,
    );
  }

  return result.data;
}
