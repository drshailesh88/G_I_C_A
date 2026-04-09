'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [showIssue, setShowIssue] = useState(false);
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

  const activeTemplates = templates.filter(t => t.status === 'active');

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
        <div className="flex gap-2">
          {activeTemplates.length > 0 && (
            <button
              onClick={() => setShowIssue(true)}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Issue Certificate
            </button>
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
              <div key={t.id} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
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
                  <div className="flex shrink-0 items-center gap-2">
                    {(t.status === 'draft' || t.status === 'active') && (
                      <button
                        onClick={() => setEditingTemplate(t)}
                        className="rounded px-3 py-1 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100"
                      >
                        Edit
                      </button>
                    )}
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
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Delivery</th>
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
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span title="Downloads">{cert.downloadCount} dl</span>
                        <span title="Verifications">{cert.verificationCount} ver</span>
                        {cert.lastSentAt && (
                          <span className="text-green-600" title={`Last sent: ${new Date(cert.lastSentAt).toLocaleString()}`}>sent</span>
                        )}
                      </div>
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
                        {cert.status === 'revoked' && cert.revokeReason && (
                          <span className="text-xs text-gray-400 italic" title={cert.revokeReason}>
                            {cert.revokeReason.length > 30 ? `${cert.revokeReason.slice(0, 30)}...` : cert.revokeReason}
                          </span>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => e.target === e.currentTarget && onClose()}>
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
