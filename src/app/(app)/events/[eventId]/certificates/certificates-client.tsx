'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DetailView } from '@/components/responsive/detail-view';
import {
  ResponsiveList,
  type Column,
} from '@/components/responsive/responsive-list';
import {
  createCertificateTemplate,
  updateCertificateTemplate,
  activateCertificateTemplate,
  archiveCertificateTemplate,
} from '@/lib/actions/certificate';
import {
  issueCertificate,
  revokeCertificate,
  getCertificateDownloadUrl,
  resendCertificateNotification,
} from '@/lib/actions/certificate-issuance';
import { bulkZipDownload } from '@/lib/actions/certificate-bulk-zip';
import { searchPeople } from '@/lib/actions/person';
import { CERTIFICATE_TYPES, AUDIENCE_SCOPES, ELIGIBILITY_BASIS_TYPES } from '@/lib/validations/certificate';

type Template = {
  id: string;
  templateName: string;
  certificateType: string;
  audienceScope: string;
  status: string;
  versionNo: number;
  allowedVariablesJson: unknown;
  requiredVariablesJson: unknown;
  defaultFileNamePattern: string;
  qrVerificationEnabled: boolean;
  verificationText: string | null;
  notes: string | null;
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
  verificationCount: number;
  lastDownloadedAt: Date | null;
  lastSentAt: Date | null;
  storageKey: string | null;
  recipientName: string;
  registrationNumber: string | null;
};

type Props = {
  eventId: string;
  templates: Template[];
  issuedCertificates: IssuedCert[];
  initialTab?: 'templates' | 'issued';
};

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  archived: 'bg-yellow-100 text-yellow-700',
  issued: 'bg-blue-100 text-blue-700',
  superseded: 'bg-gray-100 text-gray-500',
  revoked: 'bg-red-100 text-red-700',
};

function formatIssuedDate(value: Date) {
  return new Date(value).toLocaleDateString();
}

export function CertificatesClient({
  eventId,
  templates,
  issuedCertificates,
  initialTab = 'templates',
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'templates' | 'issued'>(initialTab);
  const [showCreate, setShowCreate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [showIssue, setShowIssue] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [bulkZipType, setBulkZipType] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Issued certificates filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDelivery, setFilterDelivery] = useState<string>('all');
  const [resendTarget, setResendTarget] = useState<string | null>(null);
  const [resendChannel, setResendChannel] = useState<'email' | 'whatsapp' | 'both'>('email');

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

  async function handlePreview(certificateId: string) {
    setError(null);
    try {
      const { url } = await getCertificateDownloadUrl(eventId, certificateId);
      window.open(url, '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    }
  }

  function handleResend(certificateId: string) {
    handleAction(async () => {
      await resendCertificateNotification(eventId, {
        certificateId,
        channel: resendChannel,
      });
      setResendTarget(null);
    });
  }

  // Compute unique certificate types for filter dropdown
  const certTypeOptions = Array.from(new Set(issuedCertificates.map(c => c.certificateType)));

  // Filter and search issued certificates
  const filteredCerts = issuedCertificates.filter((cert) => {
    if (filterType !== 'all' && cert.certificateType !== filterType) return false;
    if (filterStatus !== 'all' && cert.status !== filterStatus) return false;
    if (filterDelivery === 'sent' && !cert.lastSentAt) return false;
    if (filterDelivery === 'not_sent' && cert.lastSentAt) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const nameMatch = cert.recipientName?.toLowerCase().includes(q);
      const regMatch = cert.registrationNumber?.toLowerCase().includes(q);
      const numMatch = cert.certificateNumber.toLowerCase().includes(q);
      if (!nameMatch && !regMatch && !numMatch) return false;
    }
    return true;
  });

  const activeTemplates = templates.filter(t => t.status === 'active');
  const selectedTemplate = selectedTemplateId ? templates.find(t => t.id === selectedTemplateId) : null;

  const issuedColumns: Column<IssuedCert>[] = [
    {
      key: 'recipient',
      header: 'Recipient',
      priority: 'high',
      render: (cert) => (
        <div>
          <p className="text-sm font-medium text-gray-900">{cert.recipientName}</p>
          <p className="text-xs font-mono text-gray-400">{cert.certificateNumber}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      priority: 'high',
      render: (cert) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[cert.status] ?? 'bg-gray-100'}`}>
          {cert.status}
        </span>
      ),
    },
    {
      key: 'delivery',
      header: 'Delivery',
      priority: 'high',
      render: (cert) => (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {cert.lastSentAt ? (
            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-green-700" data-testid="delivery-sent">
              Sent
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-gray-500" data-testid="delivery-not-sent">
              Not sent
            </span>
          )}
          <span title="Downloads">{cert.downloadCount} dl</span>
        </div>
      ),
    },
    {
      key: 'registration',
      header: 'Reg #',
      priority: 'medium',
      render: (cert) => (
        <span className="text-sm font-mono text-gray-600">{cert.registrationNumber ?? '-'}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      priority: 'medium',
      render: (cert) => (
        <span className="text-sm text-gray-600">{cert.certificateType.replace(/_/g, ' ')}</span>
      ),
    },
    {
      key: 'issued',
      header: 'Issued',
      priority: 'medium',
      render: (cert) => (
        <span className="text-sm text-gray-500">{formatIssuedDate(cert.issuedAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      priority: 'medium',
      render: (cert) => renderIssuedCertificateActions({
        cert,
        pending,
        resendTarget,
        resendChannel,
        setResendTarget,
        setResendChannel,
        revokeTarget,
        revokeReason,
        setRevokeTarget,
        setRevokeReason,
        handlePreview,
        handleResend,
        handleRevoke,
      }),
    },
  ];

  const issuedEmptyState = (
    <p className="py-8 text-center text-sm text-gray-500">
      {issuedCertificates.length === 0
        ? 'No certificates issued yet.'
        : 'No certificates match the current filters.'}
    </p>
  );

  // ── List panel content ──────────────────────────────────────
  const listPanel = (
    <div className="space-y-6 p-0 md:pr-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Certificates</h1>
          <p className="mt-1 text-sm text-gray-500">
            {templates.length} template{templates.length !== 1 ? 's' : ''} &middot;{' '}
            {issuedCertificates.filter(c => c.status === 'issued').length} issued
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          {activeTemplates.length > 0 && (
            <>
              <Link
                href={`/events/${eventId}/certificates/generate`}
                className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
              >
                Bulk Generate
              </Link>
              <button
                onClick={() => setShowIssue(true)}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Issue Certificate
              </button>
            </>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Template
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 print:hidden">
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
              <div
                key={t.id}
                className={`rounded-lg border border-gray-200 bg-white px-4 py-3 cursor-pointer hover:border-blue-300 ${
                  selectedTemplateId === t.id ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => setSelectedTemplateId(t.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-gray-900">{t.templateName}</p>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {t.status}
                      </span>
                      {t.qrVerificationEnabled && (
                        <span className="inline-flex rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">QR</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {t.certificateType.replace(/_/g, ' ')} &middot; {t.audienceScope} &middot; v{t.versionNo}
                    </p>
                    {t.notes && <p className="mt-1 text-xs text-gray-400 italic">{t.notes}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 print:hidden">
                    {(t.status === 'draft' || t.status === 'active') && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingTemplate(t); }}
                        className="rounded px-3 py-1 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100"
                      >
                        Edit
                      </button>
                    )}
                    {t.status === 'draft' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleActivate(t.id); }}
                        disabled={pending}
                        className="rounded px-3 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-50"
                      >
                        Activate
                      </button>
                    )}
                    {(t.status === 'draft' || t.status === 'active') && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleArchive(t.id); }}
                        disabled={pending}
                        className="rounded px-3 py-1 text-xs font-medium text-yellow-700 bg-yellow-50 hover:bg-yellow-100 disabled:opacity-50"
                      >
                        Archive
                      </button>
                    )}
                    {t.status === 'active' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleBulkZip(t.certificateType); }}
                        disabled={pending || bulkZipType === t.certificateType}
                        className="rounded px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
                      >
                        {bulkZipType === t.certificateType ? 'Generating...' : 'Bulk ZIP'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Issued Certificates Tab */}
      {tab === 'issued' && (
        <div className="space-y-4">
          {/* Filters & Search Bar */}
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, reg# or cert#..."
              className="min-w-[200px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
              data-testid="cert-search"
            />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              data-testid="filter-type"
            >
              <option value="all">All types</option>
              {certTypeOptions.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              data-testid="filter-status"
            >
              <option value="all">All statuses</option>
              <option value="issued">Issued</option>
              <option value="superseded">Superseded</option>
              <option value="revoked">Revoked</option>
            </select>
            <select
              value={filterDelivery}
              onChange={(e) => setFilterDelivery(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              data-testid="filter-delivery"
            >
              <option value="all">All delivery</option>
              <option value="sent">Sent</option>
              <option value="not_sent">Not sent</option>
            </select>
          </div>

          {/* Results count */}
          <p className="text-xs text-gray-500" data-testid="results-count">
            Showing {filteredCerts.length} of {issuedCertificates.length} certificates
          </p>

          {/* Table */}
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <ResponsiveList
              data={filteredCerts}
              columns={issuedColumns}
              keyExtractor={(cert) => cert.id}
              renderCard={(cert) => (
                <IssuedCertificateCard
                  cert={cert}
                  pending={pending}
                  resendTarget={resendTarget}
                  resendChannel={resendChannel}
                  setResendTarget={setResendTarget}
                  setResendChannel={setResendChannel}
                  revokeTarget={revokeTarget}
                  revokeReason={revokeReason}
                  setRevokeTarget={setRevokeTarget}
                  setRevokeReason={setRevokeReason}
                  handlePreview={handlePreview}
                  handleResend={handleResend}
                  handleRevoke={handleRevoke}
                />
              )}
              emptyState={issuedEmptyState}
              isLoading={false}
            />
          </div>
        </div>
      )}
    </div>
  );

  // ── Detail panel content (selected template editor) ─────────
  const detailPanel = selectedTemplate ? (
    <div className="space-y-4 border-l border-gray-200 p-4" data-testid="certificate-detail">
      <h2 className="text-lg font-semibold text-gray-900">{selectedTemplate.templateName}</h2>
      <div className="space-y-2 text-sm text-gray-600">
        <p>Type: {selectedTemplate.certificateType.replace(/_/g, ' ')}</p>
        <p>Scope: {selectedTemplate.audienceScope}</p>
        <p>Status: <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[selectedTemplate.status] ?? 'bg-gray-100'}`}>{selectedTemplate.status}</span></p>
        <p>Version: v{selectedTemplate.versionNo}</p>
        {selectedTemplate.qrVerificationEnabled && <p>QR Verification: Enabled</p>}
        {selectedTemplate.notes && <p className="italic text-gray-400">Notes: {selectedTemplate.notes}</p>}
      </div>
      <div className="flex gap-2 print:hidden">
        {(selectedTemplate.status === 'draft' || selectedTemplate.status === 'active') && (
          <button
            onClick={() => setEditingTemplate(selectedTemplate)}
            className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Edit Template
          </button>
        )}
        {selectedTemplate.status === 'active' && (
          <Link
            href={`/events/${eventId}/certificates/editor/${selectedTemplate.id}`}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Open Editor
          </Link>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <DetailView
        list={listPanel}
        detail={detailPanel}
        showDetail={!!selectedTemplateId}
        onBack={() => setSelectedTemplateId(null)}
      />

      {/* Create Template Modal */}
      {showCreate && (
        <CreateTemplateModal
          eventId={eventId}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); router.refresh(); }}
        />
      )}

      {/* Edit Template Modal */}
      {editingTemplate && (
        <EditTemplateModal
          eventId={eventId}
          template={editingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSaved={() => { setEditingTemplate(null); router.refresh(); }}
        />
      )}

      {/* Issue Certificate Modal */}
      {showIssue && (
        <IssueCertificateModal
          eventId={eventId}
          activeTemplates={activeTemplates}
          onClose={() => setShowIssue(false)}
          onIssued={() => { setShowIssue(false); router.refresh(); }}
        />
      )}
    </>
  );
}

type IssuedActionsProps = {
  cert: IssuedCert;
  pending: boolean;
  resendTarget: string | null;
  resendChannel: 'email' | 'whatsapp' | 'both';
  setResendTarget: (value: string | null) => void;
  setResendChannel: (value: 'email' | 'whatsapp' | 'both') => void;
  revokeTarget: string | null;
  revokeReason: string;
  setRevokeTarget: (value: string | null) => void;
  setRevokeReason: (value: string) => void;
  handlePreview: (certificateId: string) => void;
  handleResend: (certificateId: string) => void;
  handleRevoke: (certificateId: string) => void;
};

function renderIssuedCertificateActions({
  cert,
  pending,
  resendTarget,
  resendChannel,
  setResendTarget,
  setResendChannel,
  revokeTarget,
  revokeReason,
  setRevokeTarget,
  setRevokeReason,
  handlePreview,
  handleResend,
  handleRevoke,
}: IssuedActionsProps) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {cert.status === 'issued' && cert.storageKey && (
        <button
          onClick={() => handlePreview(cert.id)}
          className="text-xs text-indigo-600 hover:underline"
          data-testid="btn-preview"
        >
          Preview
        </button>
      )}
      {cert.status === 'issued' && cert.storageKey && (
        resendTarget === cert.id ? (
          <div className="flex flex-wrap items-center gap-1">
            <select
              value={resendChannel}
              onChange={(e) => setResendChannel(e.target.value as 'email' | 'whatsapp' | 'both')}
              className="rounded border px-1 py-0.5 text-xs"
            >
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="both">Both</option>
            </select>
            <button
              onClick={() => handleResend(cert.id)}
              disabled={pending}
              className="text-xs text-green-600 hover:underline disabled:opacity-50"
              data-testid="btn-resend-confirm"
            >
              Send
            </button>
            <button
              onClick={() => setResendTarget(null)}
              className="text-xs text-gray-400 hover:underline"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setResendTarget(cert.id)}
            className="text-xs text-green-600 hover:underline"
            data-testid="btn-resend"
          >
            Resend
          </button>
        )
      )}
      {cert.status === 'issued' && (
        revokeTarget === cert.id ? (
          <div className="flex flex-wrap items-center gap-1">
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
              data-testid="btn-revoke-confirm"
            >
              Confirm
            </button>
            <button
              onClick={() => {
                setRevokeTarget(null);
                setRevokeReason('');
              }}
              className="text-xs text-gray-400 hover:underline"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setRevokeTarget(cert.id)}
            className="text-xs text-red-600 hover:underline"
            data-testid="btn-revoke"
          >
            Revoke
          </button>
        )
      )}
      {cert.status === 'revoked' && cert.revokeReason && (
        <span className="text-xs text-gray-400 italic" title={cert.revokeReason}>
          {cert.revokeReason.length > 30 ? `${cert.revokeReason.slice(0, 30)}...` : cert.revokeReason}
        </span>
      )}
    </div>
  );
}

function IssuedCertificateCard(props: IssuedActionsProps) {
  const { cert } = props;
  return (
    <div data-testid="issued-cert-card" className="space-y-3 rounded-lg border border-gray-200 bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">{cert.recipientName}</p>
          <p className="text-xs font-mono text-gray-400">{cert.certificateNumber}</p>
        </div>
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[cert.status] ?? 'bg-gray-100'}`}>
          {cert.status}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
        <div>
          <span className="font-medium text-gray-700">Reg #:</span> {cert.registrationNumber ?? '-'}
        </div>
        <div>
          <span className="font-medium text-gray-700">Issued:</span> {formatIssuedDate(cert.issuedAt)}
        </div>
        <div className="col-span-2">
          <span className="font-medium text-gray-700">Type:</span> {cert.certificateType.replace(/_/g, ' ')}
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        {cert.lastSentAt ? (
          <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-green-700" data-testid="delivery-sent">
            Sent
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-gray-500" data-testid="delivery-not-sent">
            Not sent
          </span>
        )}
        <span title="Downloads">{cert.downloadCount} dl</span>
      </div>
      {renderIssuedCertificateActions(props)}
    </div>
  );
}

// ── Create Template Modal ────────────────────────────────────
function CreateTemplateModal({
  eventId, onClose, onCreated,
}: { eventId: string; onClose: () => void; onCreated: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [certType, setCertType] = useState<string>(CERTIFICATE_TYPES[0]);
  const [scope, setScope] = useState<string>(AUDIENCE_SCOPES[0]);
  const [variables, setVariables] = useState('full_name, event_name, certificate_number');
  const [notes, setNotes] = useState('');

  function handleCreate() {
    if (!name.trim()) return;
    setError(null);
    const vars = variables.split(',').map(v => v.trim()).filter(Boolean);
    startTransition(async () => {
      try {
        await createCertificateTemplate(eventId, {
          templateName: name.trim(),
          certificateType: certType,
          audienceScope: scope,
          templateJson: { schemas: [], basePdf: '' },
          allowedVariablesJson: vars,
          requiredVariablesJson: vars.filter(v => ['full_name', 'event_name'].includes(v)),
          notes: notes.trim() || undefined,
        });
        onCreated();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create template');
      }
    });
  }

  return (
    <ModalShell title="New Certificate Template" onClose={onClose}>
      {error && <div className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
      <div className="space-y-3">
        <Field label="Template Name">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. Delegate Attendance Certificate" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Certificate Type">
            <select value={certType} onChange={(e) => setCertType(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
              {CERTIFICATE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Audience Scope">
            <select value={scope} onChange={(e) => setScope(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
              {AUDIENCE_SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Template Variables (comma-separated)">
          <input type="text" value={variables} onChange={(e) => setVariables(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="full_name, event_name, date, certificate_number" />
        </Field>
        <Field label="Notes (optional)">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </Field>
      </div>
      <ModalActions onClose={onClose} onConfirm={handleCreate} pending={pending}
        disabled={!name.trim()} label="Create Template" />
    </ModalShell>
  );
}

// ── Edit Template Modal ──────────────────────────────────────
function EditTemplateModal({
  eventId, template, onClose, onSaved,
}: { eventId: string; template: Template; onClose: () => void; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(template.templateName);
  const [variables, setVariables] = useState(
    Array.isArray(template.allowedVariablesJson)
      ? (template.allowedVariablesJson as string[]).join(', ')
      : '',
  );
  const [fileNamePattern, setFileNamePattern] = useState(template.defaultFileNamePattern);
  const [qrEnabled, setQrEnabled] = useState(template.qrVerificationEnabled);
  const [verificationText, setVerificationText] = useState(template.verificationText ?? '');
  const [notes, setNotes] = useState(template.notes ?? '');

  function handleSave() {
    setError(null);
    const vars = variables.split(',').map(v => v.trim()).filter(Boolean);
    startTransition(async () => {
      try {
        await updateCertificateTemplate(eventId, {
          templateId: template.id,
          templateName: name.trim() || undefined,
          allowedVariablesJson: vars.length > 0 ? vars : undefined,
          requiredVariablesJson: vars.filter(v => ['full_name', 'event_name'].includes(v)),
          defaultFileNamePattern: fileNamePattern.trim() || undefined,
          qrVerificationEnabled: qrEnabled,
          verificationText: verificationText.trim() || undefined,
          notes: notes.trim() || undefined,
        });
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update template');
      }
    });
  }

  return (
    <ModalShell title={`Edit: ${template.templateName}`} onClose={onClose}>
      {error && <div className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
      <div className="space-y-3">
        <Field label="Template Name">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </Field>
        <Field label="Allowed Variables (comma-separated)">
          <input type="text" value={variables} onChange={(e) => setVariables(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </Field>
        <Field label="File Name Pattern">
          <input type="text" value={fileNamePattern} onChange={(e) => setFileNamePattern(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono text-xs" />
        </Field>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="qr-enabled" checked={qrEnabled} onChange={(e) => setQrEnabled(e.target.checked)} />
          <label htmlFor="qr-enabled" className="text-sm text-gray-700">QR Verification Enabled</label>
        </div>
        {qrEnabled && (
          <Field label="Verification Text">
            <input type="text" value={verificationText} onChange={(e) => setVerificationText(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="Scan QR code to verify this certificate" />
          </Field>
        )}
        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </Field>
        <p className="text-xs text-gray-400">
          Type: {template.certificateType.replace(/_/g, ' ')} &middot; Scope: {template.audienceScope} &middot; Status: {template.status} &middot; v{template.versionNo}
        </p>
      </div>
      <ModalActions onClose={onClose} onConfirm={handleSave} pending={pending} label="Save Changes" />
    </ModalShell>
  );
}

// ── Issue Certificate Modal ──────────────────────────────────
type PersonResult = { id: string; fullName: string; email: string | null; designation: string | null };

function IssueCertificateModal({
  eventId, activeTemplates, onClose, onIssued,
}: { eventId: string; activeTemplates: Template[]; onClose: () => void; onIssued: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState(activeTemplates[0]?.id ?? '');
  const [eligibilityType, setEligibilityType] = useState<string>(ELIGIBILITY_BASIS_TYPES[0]);

  // Person search state
  const [personQuery, setPersonQuery] = useState('');
  const [personResults, setPersonResults] = useState<PersonResult[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<PersonResult | null>(null);
  const [searching, setSearching] = useState(false);

  // Variable values (auto-populated from template + person)
  const selectedTemplate = activeTemplates.find(t => t.id === templateId);
  const templateVars = Array.isArray(selectedTemplate?.allowedVariablesJson)
    ? (selectedTemplate.allowedVariablesJson as string[])
    : [];
  const [varValues, setVarValues] = useState<Record<string, string>>({});

  async function handlePersonSearch() {
    if (!personQuery.trim()) return;
    setSearching(true);
    try {
      const result = await searchPeople({ query: personQuery.trim(), page: 1, limit: 10, view: 'all' });
      setPersonResults(result.people?.map((r: any) => ({
        id: r.id, fullName: r.fullName, email: r.email, designation: r.designation,
      })) ?? []);
    } catch {
      setPersonResults([]);
    } finally {
      setSearching(false);
    }
  }

  function handleSelectPerson(person: PersonResult) {
    setSelectedPerson(person);
    setPersonResults([]);
    setPersonQuery(person.fullName);
    // Auto-populate known variables
    setVarValues((prev) => ({
      ...prev,
      full_name: person.fullName,
      recipient_name: person.fullName,
      designation: person.designation ?? '',
      email: person.email ?? '',
    }));
  }

  function handleIssue() {
    if (!selectedPerson || !templateId) return;
    setError(null);
    startTransition(async () => {
      try {
        await issueCertificate(eventId, {
          personId: selectedPerson.id,
          templateId,
          certificateType: selectedTemplate?.certificateType ?? CERTIFICATE_TYPES[0],
          eligibilityBasisType: eligibilityType,
          renderedVariablesJson: varValues,
        });
        onIssued();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Issuance failed');
      }
    });
  }

  return (
    <ModalShell title="Issue Certificate" onClose={onClose}>
      {error && <div className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
      <div className="space-y-3">
        <Field label="Template">
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
            {activeTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.templateName} ({t.certificateType.replace(/_/g, ' ')})
              </option>
            ))}
          </select>
        </Field>

        {/* Person search picker */}
        <Field label="Recipient">
          <div className="relative">
            <div className="flex gap-2">
              <input type="text" value={personQuery}
                onChange={(e) => { setPersonQuery(e.target.value); setSelectedPerson(null); }}
                onKeyDown={(e) => e.key === 'Enter' && handlePersonSearch()}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Search by name, email, or phone..." />
              <button onClick={handlePersonSearch} disabled={searching || !personQuery.trim()}
                className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200 disabled:opacity-50">
                {searching ? '...' : 'Search'}
              </button>
            </div>
            {selectedPerson && (
              <div className="mt-1 flex items-center gap-2 rounded bg-blue-50 px-2 py-1 text-sm text-blue-800">
                <span className="font-medium">{selectedPerson.fullName}</span>
                {selectedPerson.email && <span className="text-blue-600 text-xs">{selectedPerson.email}</span>}
                <button onClick={() => { setSelectedPerson(null); setPersonQuery(''); }}
                  className="ml-auto text-blue-400 hover:text-blue-600 text-xs">Clear</button>
              </div>
            )}
            {personResults.length > 0 && !selectedPerson && (
              <ul className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                {personResults.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => handleSelectPerson(p)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50">
                      <span className="font-medium">{p.fullName}</span>
                      {p.email && <span className="ml-2 text-gray-500 text-xs">{p.email}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Field>

        <Field label="Eligibility Basis">
          <select value={eligibilityType} onChange={(e) => setEligibilityType(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
            {ELIGIBILITY_BASIS_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </Field>

        {/* Auto-populated template variables */}
        {templateVars.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase">Certificate Variables</p>
            {templateVars.map((varName) => (
              <div key={varName} className="flex items-center gap-2">
                <label className="w-32 text-xs text-gray-600 truncate" title={varName}>
                  {varName.replace(/_/g, ' ')}
                </label>
                <input type="text"
                  value={varValues[varName] ?? ''}
                  onChange={(e) => setVarValues((prev) => ({ ...prev, [varName]: e.target.value }))}
                  className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm" />
              </div>
            ))}
          </div>
        )}
      </div>
      <ModalActions onClose={onClose} onConfirm={handleIssue} pending={pending}
        disabled={!selectedPerson || !templateId} label="Issue Certificate" />
    </ModalShell>
  );
}

// ── Shared UI helpers ────────────────────────────────────────
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="safe-area-insets fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:hidden" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <div className="mt-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ModalActions({ onClose, onConfirm, pending, disabled, label }: {
  onClose: () => void; onConfirm: () => void; pending: boolean; disabled?: boolean; label: string;
}) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <button onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">
        Cancel
      </button>
      <button onClick={onConfirm} disabled={pending || disabled}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        {pending ? 'Working...' : label}
      </button>
    </div>
  );
}
