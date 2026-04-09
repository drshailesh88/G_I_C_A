import { redirect } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
import { getCertificateTemplate } from '@/lib/actions/certificate';
import { CertificateEditorClient } from './editor-client';

type Params = Promise<{ eventId: string; templateId: string }>;

export default async function CertificateEditorPage({
  params,
}: {
  params: Params;
}) {
  const { eventId, templateId } = await params;

  try {
    await assertEventAccess(eventId);
  } catch {
    redirect('/login');
  }

  const template = await getCertificateTemplate(eventId, templateId);

  return (
    <CertificateEditorClient
      eventId={eventId}
      templateId={templateId}
      templateName={template.templateName}
      certificateType={template.certificateType}
      templateJson={template.templateJson as Record<string, unknown>}
      pageSize={template.pageSize}
      orientation={template.orientation}
      allowedVariables={
        Array.isArray(template.allowedVariablesJson)
          ? (template.allowedVariablesJson as string[])
          : []
      }
      status={template.status}
      versionNo={template.versionNo}
    />
  );
}
