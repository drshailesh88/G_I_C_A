import { redirect } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
import { listCertificateTemplates } from '@/lib/actions/certificate';
import { listIssuedCertificates } from '@/lib/actions/certificate-issuance';
import { CertificatesClient } from './certificates-client';

type Params = Promise<{ eventId: string }>;

export default async function CertificatesPage({
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

  const [templates, issuedCerts] = await Promise.all([
    listCertificateTemplates(eventId),
    listIssuedCertificates(eventId),
  ]);

  return (
    <CertificatesClient
      eventId={eventId}
      templates={templates}
      issuedCertificates={issuedCerts}
    />
  );
}
