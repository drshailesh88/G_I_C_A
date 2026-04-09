'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createCertificateTemplate,
  activateCertificateTemplate,
  archiveCertificateTemplate,
} from '@/lib/actions/certificate';
import {
  revokeCertificate,
  getCertificateDownloadUrl,
} from '@/lib/actions/certificate-issuance';
import { bulkZipDownload } from '@/lib/actions/certificate-bulk-zip';
import { CERTIFICATE_TYPES, AUDIENCE_SCOPES } from '@/lib/validations/certificate';

type Template = {
  id: string;
  templateName: string;
  certificateType: string;
  audienceScope: string;
  status: string;
  versionNo: number;
  createdAt: Date;
  updatedAt: Date;
};

type IssuedCert = {
  id: string;
  certificateNumber: string;
  certificateType: string;
  status: string;
  personId: string;
  issuedAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
  downloadCount: number;
  storageKey: string | null;
};

type Props = {
  eventId: string;
  templates: Template[];
  issuedCertificates: IssuedCert[];
};

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  archived: 'bg-yellow-100 text-yellow-700',
  issued: 'bg-blue-100 text-blue-700',
  superseded: 'bg-gray-100 text-gray-500',
  revoked: 'bg-red-100 text-red-700',
};

export function CertificatesClient({ eventId, templates, issuedCertificates }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'templates' | 'issued'>('templates');
  const [showCreate, setShowCreate] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [bulkZipType, setBulkZipType] = useState<string | null>(null);

  function handleAction(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed');
      }
    });
  }

  function handleActivate(templateId: string) {
    handleAction(async () => { await activateCertificateTemplate(eventId, { templateId }); });
  }

  function handleArchive(templateId: string) {
    handleAction(async () => { await archiveCertificateTemplate(eventId, { templateId }); });
  }

  function handleRevoke(certificateId: string) {
    if (!revokeReason.trim()) return;
    handleAction(async () => {
      await revokeCertificate(eventId, { certificateId, revokeReason: revokeReason.trim() });
      setRevokeTarget(null);
      setRevokeReason('');
    });
  }

  async function handleDownload(certificateId: string) {
    setError(null);
    try {
      const { url, fileName } = await getCertificateDownloadUrl(eventId, certificateId);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  }

  function handleBulkZip(certType: string) {
    setBulkZipType(certType);
    handleAction(async () => {
      const result = await bulkZipDownload(eventId, { certificateType: certType });
      const a = document.createElement('a');
      a.href = result.zipUrl;
      a.download = `certificates-${certType}.zip`;
      a.click();
      setBulkZipType(null);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Certificates</h1>
          <p className="mt-1 text-sm text-gray-500">
            {templates.length} template{templates.length !== 1 ? 's' : ''} &middot;{' '}
            {issuedCertificates.filter(c => c.status === 'issued').length} issued
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Template
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['templates', 'issued'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'templates' ? 'Templates' : 'Issued Certificates'}
          </button>
        ))}
      </div>

      {/* Templates Tab */}
      {tab === 'templates' && (
        <div className="space-y-3">
          {templates.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No certificate templates yet. Create one to get started.
            </p>
          ) : (
            templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-gray-900">{t.templateName}</p>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {t.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t.certificateType.replace(/_/g, ' ')} &middot; {t.audienceScope} &middot; v{t.versionNo}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {t.status === 'draft' && (
                    <button
                      onClick={() => handleActivate(t.id)}
                      disabled={pending}
                      className="rounded px-3 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-50"
                    >
                      Activate
                    </button>
                  )}
                  {(t.status === 'draft' || t.status === 'active') && (
                    <button
                      onClick={() => handleArchive(t.id)}
                      disabled={pending}
                      className="rounded px-3 py-1 text-xs font-medium text-yellow-700 bg-yellow-50 hover:bg-yellow-100 disabled:opacity-50"
                    >
                      Archive
                    </button>
                  )}
                  {t.status === 'active' && (
                    <button
                      onClick={() => handleBulkZip(t.certificateType)}
                      disabled={pending || bulkZipType === t.certificateType}
                      className="rounded px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
                    >
                      {bulkZipType === t.certificateType ? 'Generating...' : 'Bulk ZIP'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Issued Certificates Tab */}
      {tab === 'issued' && (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          {issuedCertificates.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No certificates issued yet.</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Number</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Issued</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {issuedCertificates.map((cert) => (
                  <tr key={cert.id}>
                    <td className="px-4 py-2 text-sm font-mono text-gray-900">{cert.certificateNumber}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">{cert.certificateType.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[cert.status] ?? 'bg-gray-100'}`}>
                        {cert.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {new Date(cert.issuedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {cert.status === 'issued' && cert.storageKey && (
                          <button
                            onClick={() => handleDownload(cert.id)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Download
                          </button>
                        )}
                        {cert.status === 'issued' && (
                          revokeTarget === cert.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={revokeReason}
                                onChange={(e) => setRevokeReason(e.target.value)}
                                placeholder="Reason..."
                                className="w-32 rounded border px-2 py-0.5 text-xs"
                              />
                              <button
                                onClick={() => handleRevoke(cert.id)}
                                disabled={pending || !revokeReason.trim()}
                                className="text-xs text-red-600 hover:underline disabled:opacity-50"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => { setRevokeTarget(null); setRevokeReason(''); }}
                                className="text-xs text-gray-400 hover:underline"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setRevokeTarget(cert.id)}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Revoke
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Create Template Modal */}
      {showCreate && (
        <CreateTemplateModal
          eventId={eventId}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

// ── Create Template Modal ────────────────────────────────────
function CreateTemplateModal({
  eventId,
  onClose,
  onCreated,
}: {
  eventId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [certType, setCertType] = useState<string>(CERTIFICATE_TYPES[0]);
  const [scope, setScope] = useState<string>(AUDIENCE_SCOPES[0]);

  function handleCreate() {
    if (!name.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await createCertificateTemplate(eventId, {
          templateName: name.trim(),
          certificateType: certType,
          audienceScope: scope,
          templateJson: {},
        });
        onCreated();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create template');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">New Certificate Template</h2>

        {error && (
          <div className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>
        )}

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Template Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="e.g. Delegate Attendance Certificate"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Certificate Type</label>
            <select
              value={certType}
              onChange={(e) => setCertType(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {CERTIFICATE_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Audience Scope</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {AUDIENCE_SCOPES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={pending || !name.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? 'Creating...' : 'Create Template'}
          </button>
        </div>
      </div>
    </div>
  );
}
