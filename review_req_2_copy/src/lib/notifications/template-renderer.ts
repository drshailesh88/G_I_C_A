/**
 * Template Renderer
 *
 * Resolves the correct template (event override > global default),
 * validates required variables, and renders content by replacing
 * {{variable}} placeholders with provided values.
 */

import { db } from '@/lib/db';
import { notificationTemplates } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import type { Channel, TemplateRenderResult } from './types';
import { interpolate, validateRequiredVariables } from './template-utils';

// Re-export pure utils for convenience
export { interpolate, validateRequiredVariables } from './template-utils';

export type RenderTemplateInput = {
  eventId: string;
  channel: Channel;
  templateKey: string;
  variables: Record<string, unknown>;
};

/**
 * Resolve template: event-specific override first, then global default.
 * Only active templates are considered.
 */
export async function resolveTemplate(
  eventId: string,
  channel: Channel,
  templateKey: string,
) {
  // Try event-specific override first
  const eventTemplates = await db
    .select()
    .from(notificationTemplates)
    .where(
      and(
        eq(notificationTemplates.eventId, eventId),
        eq(notificationTemplates.channel, channel),
        eq(notificationTemplates.templateKey, templateKey),
        eq(notificationTemplates.status, 'active'),
      ),
    )
    .limit(1);

  if (eventTemplates.length > 0) {
    return eventTemplates[0];
  }

  // Fall back to global default (eventId is null)
  const globalTemplates = await db
    .select()
    .from(notificationTemplates)
    .where(
      and(
        isNull(notificationTemplates.eventId),
        eq(notificationTemplates.channel, channel),
        eq(notificationTemplates.templateKey, templateKey),
        eq(notificationTemplates.status, 'active'),
      ),
    )
    .limit(1);

  return globalTemplates[0] ?? null;
}

/**
 * Render a template: resolve, validate, interpolate.
 */
export async function renderTemplate(
  input: RenderTemplateInput,
): Promise<TemplateRenderResult & { templateId: string; templateVersionNo: number }> {
  const template = await resolveTemplate(
    input.eventId,
    input.channel,
    input.templateKey,
  );

  if (!template) {
    throw new Error(
      `No active template found for key="${input.templateKey}" channel="${input.channel}" eventId="${input.eventId}"`,
    );
  }

  // Validate required variables
  const requiredVars = (template.requiredVariablesJson as string[]) ?? [];
  const missing = validateRequiredVariables(requiredVars, input.variables);
  if (missing.length > 0) {
    throw new Error(
      `Missing required template variables: ${missing.join(', ')}`,
    );
  }

  // Render
  const body = interpolate(template.bodyContent, input.variables);
  const subject = template.subjectLine
    ? interpolate(template.subjectLine, input.variables)
    : null;

  return {
    templateId: template.id,
    templateVersionNo: template.versionNo,
    subject,
    body,
    variables: input.variables,
  };
}
