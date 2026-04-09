import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';

export default async function CertificatesPage({
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
        <h1 className="text-2xl font-bold text-gray-900">Certificates</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage certificate templates, issue certificates, and track delivery.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-500">
          Certificate management interface — templates, issuance, and bulk generation.
        </p>
        <p className="mt-2 text-xs text-gray-400">Event: {eventId}</p>
      </div>
    </div>
  );
}
