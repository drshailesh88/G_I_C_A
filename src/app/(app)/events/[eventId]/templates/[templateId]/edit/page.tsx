import { notFound, redirect } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
import { ROLES } from '@/lib/auth/roles';
import { getTemplateEditorEntry, getSiblingTemplate } from '@/lib/actions/notifications';
import { TemplateEditorClient } from './template-editor-client';

const COMMUNICATIONS_WRITE_ROLES = new Set<string>([ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR]);

export default async function TemplateEditPage({
  params,
}: {
  params: Promise<{ eventId: string; templateId: string }>;
}) {
  const { eventId, templateId } = await params;

  let role: string | null | undefined;
  try {
    const access = await assertEventAccess(eventId);
    role = access.role;
  } catch {
    redirect(`/events/${eventId}/templates`);
  }

  const canWrite = !!role && COMMUNICATIONS_WRITE_ROLES.has(role);

  let template: Awaited<ReturnType<typeof getTemplateEditorEntry>>;
  try {
    template = await getTemplateEditorEntry({ eventId, templateId });
  } catch (error) {
    if (error instanceof Error && error.message === 'Notification template not found') {
      notFound();
    }
    redirect(`/events/${eventId}/templates`);
  }

  const sibling = await getSiblingTemplate({
    eventId,
    templateKey: template.templateKey,
    channel: template.channel as 'email' | 'whatsapp',
  }).catch(() => null);

  return (
    <TemplateEditorClient
      eventId={eventId}
      primaryTemplate={template}
      siblingTemplate={sibling}
      canWrite={canWrite}
    />
  );
}
