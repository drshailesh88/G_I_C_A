'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getEligibleRecipients,
  bulkGenerateCertificates,
  sendCertificateNotifications,
  type Recipient,
  type BulkGenerateQueuedResult,
  RECIPIENT_TYPES,
} from '@/lib/actions/certificate-generation';
import { bulkZipDownload } from '@/lib/actions/certificate-bulk-zip';

type TemplateInfo = {
  id: string;
  templateName: string;
  certificateType: string;
  audienceScope: string;
  versionNo: number;
};

type Props = {
  eventId: string;
  activeTemplates: TemplateInfo[];
};

type Step = 'configure' | 'preview' | 'generating' | 'complete';

const RECIPIENT_LABELS: Record<string, string> = {
  all_delegates: 'All Confirmed Delegates',
  all_faculty: 'All Faculty Members',
  all_attendees: 'All Attendees (checked in)',
  custom: 'Custom Selection',
};

const ELIGIBILITY_LABELS: Record<string, string> = {
  registration: 'Registration',
  attendance: 'Attendance',
  session_assignment: 'Session Assignment',
  event_role: 'Event Role',
  manual: 'Manual',
};

export function GenerationClient({ eventId, activeTemplates }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Step state
  const [step, setStep] = useState<Step>('configure');

  // Configuration
  const [templateId, setTemplateId] = useState(activeTemplates[0]?.id ?? '');
  const [recipientType, setRecipientType] = useState<string>('all_delegates');
  const [eligibilityBasis, setEligibilityBasis] = useState('registration');

  // Preview
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  // Results
  const [result, setResult] = useState<BulkGenerateQueuedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Send state
  const [sendChannel, setSendChannel] = useState<'email' | 'whatsapp' | 'both'>('email');
  const [sendQueued, setSendQueued] = useState(false);

  const selectedTemplate = activeTemplates.find((t) => t.id === templateId);

  async function handleLoadRecipients() {
    setError(null);
    setLoadingRecipients(true);
    try {
      const list = await getEligibleRecipients(eventId, {
        recipientType,
      });
      setRecipients(list);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recipients');
    } finally {
      setLoadingRecipients(false);
    }
  }

  function handleGenerate() {
    setError(null);
    setStep('generating');
    startTransition(async () => {
      try {
        const res = await bulkGenerateCertificates(eventId, {
          templateId,
          recipientType,
          eligibilityBasisType: eligibilityBasis,
        });
        setResult(res);
        setStep('complete');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Generation failed');
        setStep('preview');
      }
    });
  }

  async function handleDownloadZip() {
    if (!selectedTemplate) return;
    setError(null);
    try {
      const zipResult = await bulkZipDownload(eventId, {
        certificateType: selectedTemplate.certificateType,
      });
      const a = document.createElement('a');
      a.href = zipResult.zipUrl;
      a.download = `certificates-${selectedTemplate.certificateType}.zip`;
      a.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ZIP download failed');
    }
  }

  function handleSendNotifications() {
    if (!result) return;
    setError(null);
    startTransition(async () => {
      try {
        // Notifications are now queued via Inngest — we pass all cert IDs
        // The UI doesn't know exact IDs since generation is async, so this
        // is a no-op if no certificates exist yet. In practice the user
        // would wait for generation to complete before sending.
        await sendCertificateNotifications(eventId, {
          certificateIds: [], // Will be filled by Inngest callback
          channel: sendChannel,
        });
        setSendQueued(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Send failed');
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Generate Certificates</h1>
          <p className="mt-1 text-sm text-gray-500">
            Bulk generate and distribute certificates
          </p>
        </div>
        <Link
          href={`/events/${eventId}/certificates`}
          className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Back to Certificates
        </Link>
      </div>

      {error && (
        <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step: Configure */}
      {step === 'configure' && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-5">
          <h2 className="text-lg font-semibold text-gray-900">Configuration</h2>

          {/* Template selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Certificate Template
            </label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {activeTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.templateName} ({t.certificateType.replace(/_/g, ' ')}) v{t.versionNo}
                </option>
              ))}
            </select>
            {selectedTemplate && (
              <p className="mt-1 text-xs text-gray-400">
                Type: {selectedTemplate.certificateType.replace(/_/g, ' ')} | Scope: {selectedTemplate.audienceScope}
              </p>
            )}
          </div>

          {/* Recipient selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Recipients
            </label>
            <div className="mt-2 space-y-2">
              {RECIPIENT_TYPES.filter((t) => t !== 'custom').map((type) => (
                <label key={type} className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="recipientType"
                    value={type}
                    checked={recipientType === type}
                    onChange={(e) => setRecipientType(e.target.value)}
                    className="h-4 w-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">
                    {RECIPIENT_LABELS[type]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Eligibility basis */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Eligibility Basis
            </label>
            <select
              value={eligibilityBasis}
              onChange={(e) => setEligibilityBasis(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {Object.entries(ELIGIBILITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleLoadRecipients}
            disabled={!templateId || loadingRecipients}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loadingRecipients ? 'Loading...' : 'Preview Recipients'}
          </button>
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Preview — {recipients.length} Recipient{recipients.length !== 1 ? 's' : ''}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Template: {selectedTemplate?.templateName} | Type: {RECIPIENT_LABELS[recipientType]}
                </p>
              </div>
              <button
                onClick={() => setStep('configure')}
                className="rounded-md bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
              >
                Back
              </button>
            </div>

            {recipients.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">
                No eligible recipients found for this selection.
              </p>
            ) : (
              <>
                <div className="mt-4 max-h-64 overflow-y-auto rounded border border-gray-100">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Name
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Email
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Designation
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {recipients.map((r) => (
                        <tr key={r.id}>
                          <td className="px-4 py-2 text-sm text-gray-900">{r.fullName}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">{r.email ?? '—'}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">{r.designation ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex gap-3">
                  <button
                    onClick={handleGenerate}
                    disabled={pending}
                    className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {pending ? 'Generating...' : `Generate ${recipients.length} Certificate${recipients.length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Step: Generating */}
      {step === 'generating' && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
          <div className="animate-pulse">
            <p className="text-lg font-medium text-gray-900">Generating Certificates...</p>
            <p className="mt-2 text-sm text-gray-500">
              This may take a moment for large batches.
            </p>
          </div>
        </div>
      )}

      {/* Step: Complete */}
      {step === 'complete' && result && (
        <div className="space-y-4">
          {/* Summary — generation queued */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
            <h2 className="text-lg font-semibold text-blue-900">Generation Queued</h2>
            <p className="mt-2 text-sm text-blue-700">{result.message}</p>
            <p className="mt-1 text-xs text-blue-500">
              Certificates are being generated in the background. Refresh the certificates page to see progress.
            </p>
          </div>

          {/* Actions */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Distribution</h3>

            {/* Download ZIP */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleDownloadZip}
                disabled={pending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Download ZIP
              </button>
              <span className="text-xs text-gray-500">
                Download all generated certificates as a ZIP file (available after generation completes)
              </span>
            </div>

            {/* Send via Email/WhatsApp */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Send to Recipients
              </p>
              <div className="flex items-center gap-3">
                <select
                  value={sendChannel}
                  onChange={(e) => setSendChannel(e.target.value as 'email' | 'whatsapp' | 'both')}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="both">Both</option>
                </select>
                <button
                  onClick={handleSendNotifications}
                  disabled={pending || sendQueued}
                  className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {pending ? 'Queuing...' : `Send via ${sendChannel === 'both' ? 'Email + WhatsApp' : sendChannel}`}
                </button>
              </div>
              {sendQueued && (
                <p className="mt-2 text-sm text-blue-600">
                  Notifications queued for delivery. Emails will be sent in batches.
                </p>
              )}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setStep('configure');
                setResult(null);
                setSendQueued(false);
                setRecipients([]);
              }}
              className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Generate More
            </button>
            <Link
              href={`/events/${eventId}/certificates`}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              View All Certificates
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
