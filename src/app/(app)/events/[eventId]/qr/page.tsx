import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';

export default async function QrCheckInPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const { eventId } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">QR Check-In</h1>
        <p className="mt-1 text-sm text-gray-500">
          Scan QR codes or search registrations for manual check-in.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-500">
          QR scanner, manual check-in search, and attendance tracking.
        </p>
        <p className="mt-2 text-xs text-gray-400">Event: {eventId}</p>
      </div>
    </div>
  );
}
