import { redirect } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
import { listCertificateTemplates } from '@/lib/actions/certificate';
import { GenerationClient } from './generation-client';

type Params = Promise<{ eventId: string }>;

export default async function CertificateGenerationPage({
  params,
}: {
  params: Params;
}) {
  const { eventId } = await params;

  try {
    await assertEventAccess(eventId);
  } catch {
    redirect('/login');
  }

  const templates = await listCertificateTemplates(eventId);
  const activeTemplates = templates.filter((t) => t.status === 'active');

  if (activeTemplates.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Generate Certificates</h1>
        <p className="text-sm text-gray-500">
          No active certificate templates found. Create and activate a template first.
        </p>
      </div>
    );
  }

  return (
    <GenerationClient
      eventId={eventId}
      activeTemplates={activeTemplates.map((t) => ({
        id: t.id,
        templateName: t.templateName,
        certificateType: t.certificateType,
        audienceScope: t.audienceScope,
        versionNo: t.versionNo,
      }))}
    />
  );
}
