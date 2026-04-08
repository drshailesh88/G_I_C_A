import { getFailedNotifications } from '@/lib/actions/notifications';
import { FailedNotificationsClient } from './failed-notifications-client';

export default async function FailedNotificationsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const failedLogs = await getFailedNotifications({
    eventId,
    limit: 50,
    offset: 0,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Failed Notifications</h1>
        <p className="text-muted-foreground mt-1">
          Notifications that failed to send. Review errors and retry.
        </p>
      </div>
      <FailedNotificationsClient
        eventId={eventId}
        initialLogs={JSON.parse(JSON.stringify(failedLogs))}
      />
    </div>
  );
}
