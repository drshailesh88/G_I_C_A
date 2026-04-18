import Link from 'next/link';
import { getRecentNotifications } from '@/lib/actions/dashboard';

function formatRelativeTimestamp(value: Date | string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function formatChannel(channel: string) {
  return channel === 'email' ? 'Email' : 'WhatsApp';
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default async function CommunicationsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { items, unreadCount } = await getRecentNotifications(eventId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Communications</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Recent notification activity for this event.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded-full bg-border px-3 py-1 text-text-secondary">
            {unreadCount} unread
          </span>
          <Link
            href={`/events/${eventId}/communications/failed`}
            className="font-medium text-primary hover:underline"
          >
            View failed notifications
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-text-secondary">
            No notifications have been logged for this event yet.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {item.subject}
                  </p>
                  <p className="truncate text-xs text-text-secondary">
                    To: {item.recipientName}
                    {item.recipientContact ? ` · ${item.recipientContact}` : ''}
                  </p>
                </div>
                <div className="text-xs text-text-secondary sm:text-right">
                  <p>
                    {formatChannel(item.channel)} · {formatStatus(item.status)}
                  </p>
                  <p>{formatRelativeTimestamp(item.queuedAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
