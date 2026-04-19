import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Mail, MessageCircle } from 'lucide-react';
import { getTemplateEditorEntry } from '@/lib/actions/notifications';

function channelLabel(channel: string) {
  return channel === 'email' ? 'Email' : 'WhatsApp';
}

export default async function TemplateEditEntryPage({
  params,
}: {
  params: Promise<{ eventId: string; templateId: string }>;
}) {
  const { eventId, templateId } = await params;

  let template: Awaited<ReturnType<typeof getTemplateEditorEntry>>;
  try {
    template = await getTemplateEditorEntry({ eventId, templateId });
  } catch (error) {
    if (error instanceof Error && error.message === 'Notification template not found') {
      notFound();
    }
    redirect(`/events/${eventId}/templates`);
  }

  const ChannelIcon = template.channel === 'email' ? Mail : MessageCircle;

  return (
    <div className="px-4 py-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/events/${eventId}/templates`}
          className="rounded-lg p-1.5 hover:bg-border/50"
        >
          <ArrowLeft className="h-5 w-5 text-text-primary" />
        </Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Template Editor
          </p>
          <h1 className="text-lg font-bold text-text-primary">{template.templateName}</h1>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <ChannelIcon className="h-4 w-4" />
          {channelLabel(template.channel)}
          <span className="text-text-muted">·</span>
          <span>{template.templateKey}</span>
        </div>

        <p className="mt-3 text-sm text-text-secondary">
          This route is the editor handoff for the communications hub. It keeps the
          template scoped to the active event and passes control into the template
          editor flow.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border/70 bg-background p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Status
            </p>
            <p className="mt-1 text-sm text-text-primary">{template.status}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Scope
            </p>
            <p className="mt-1 text-sm text-text-primary">
              {template.eventId ? 'Event override' : 'Global default'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
