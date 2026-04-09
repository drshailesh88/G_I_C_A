import { FlagsDashboard } from './flags-dashboard';

export const metadata = { title: 'Feature Flags' };

export default async function FlagsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return <FlagsDashboard eventId={eventId} />;
}
