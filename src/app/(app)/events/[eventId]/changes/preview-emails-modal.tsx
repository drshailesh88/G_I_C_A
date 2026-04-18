'use client';

import { useState, useEffect, useTransition } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import {
  getVersionPreviewData,
  getVersionEmailParts,
  sendVersionEmails,
} from '@/lib/actions/program';

type FacultyMember = {
  id: string;
  fullName: string;
  salutation: string | null;
  email: string | null;
};

type PreviewData = {
  eventName: string;
  affectedFaculty: FacultyMember[];
};

type EmailParts = {
  subject: string;
  bodyBefore: string;
  bodyAfter: string;
  changesSummaryJson: { added_sessions?: string[]; removed_sessions?: string[] } | null;
  recipientEmail: string | null;
};

export function PreviewEmailsModal({
  eventId,
  versionId,
  versionNo,
  isOpen,
  onClose,
}: {
  eventId: string;
  versionId: string;
  versionNo: number;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [emailParts, setEmailParts] = useState<EmailParts | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isOpen) {
      setPreviewData(null);
      setSelectedPersonId('');
      setEmailParts(null);
      setSendResult(null);
      setError(null);
      return;
    }
    setLoading(true);
    getVersionPreviewData(eventId, versionId)
      .then((data) => {
        setPreviewData(data);
        if (data.affectedFaculty.length > 0) {
          setSelectedPersonId(data.affectedFaculty[0].id);
        }
      })
      .catch(() => setError('Failed to load preview data'))
      .finally(() => setLoading(false));
  }, [isOpen, eventId, versionId]);

  useEffect(() => {
    if (!selectedPersonId || !isOpen) return;
    setLoadingPreview(true);
    setEmailParts(null);
    getVersionEmailParts(eventId, versionId, selectedPersonId)
      .then(setEmailParts)
      .catch(() => setError('Failed to render email preview'))
      .finally(() => setLoadingPreview(false));
  }, [selectedPersonId, eventId, versionId, isOpen]);

  function handleSendAll() {
    startTransition(async () => {
      setError(null);
      try {
        const result = await sendVersionEmails(eventId, versionId);
        setSendResult(result);
      } catch {
        setError('Failed to send emails. Please try again.');
      }
    });
  }

  if (!isOpen) return null;

  const affectedCount = previewData?.affectedFaculty.length ?? 0;
  const selectedIndex = previewData?.affectedFaculty.findIndex((f) => f.id === selectedPersonId) ?? -1;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background md:items-center md:justify-center md:bg-black/50"
      data-testid="preview-emails-modal"
      aria-modal="true"
      role="dialog"
      aria-label={`Email Preview — Version ${versionNo}`}
    >
      <div className="flex flex-col flex-1 md:flex-none md:max-w-[560px] md:w-full md:max-h-[85vh] md:rounded-xl md:shadow-xl md:bg-background md:overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-base font-semibold" data-testid="modal-title">
            Email Preview
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted transition-colors"
            aria-label="Close preview"
            data-testid="modal-close-btn"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-8" data-testid="loading-state">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : affectedCount === 0 ? (
          <div className="flex-1 px-4 py-6 text-sm text-muted-foreground" data-testid="no-faculty-state">
            No faculty members are affected by this version.
          </div>
        ) : (
          <>
            {/* Faculty selector */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <label className="text-sm text-muted-foreground whitespace-nowrap">Preview as:</label>
              <select
                value={selectedPersonId}
                onChange={(e) => setSelectedPersonId(e.target.value)}
                className="flex-1 text-sm rounded-md border border-input bg-background px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="faculty-select"
              >
                {previewData?.affectedFaculty.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.salutation ? `${f.salutation} ${f.fullName}` : f.fullName}
                  </option>
                ))}
              </select>
              <span
                className="text-xs text-muted-foreground whitespace-nowrap"
                data-testid="affected-count"
              >
                {selectedIndex + 1} of {affectedCount} affected
              </span>
            </div>

            {/* Email preview */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {loadingPreview ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : emailParts ? (
                <div
                  className="rounded-lg border border-border bg-card text-sm"
                  data-testid="email-preview"
                >
                  {/* Email headers */}
                  <div className="px-4 py-3 border-b border-border space-y-1">
                    {emailParts.recipientEmail && (
                      <div className="text-xs text-muted-foreground" data-testid="recipient-email">
                        <span className="font-medium text-foreground">To:</span>{' '}
                        {emailParts.recipientEmail}
                      </div>
                    )}
                    <div className="text-xs font-medium" data-testid="email-subject">
                      <span className="text-muted-foreground">Subject:</span> {emailParts.subject}
                    </div>
                  </div>

                  {/* Email body */}
                  <div className="px-4 py-3 space-y-3">
                    <div
                      className="whitespace-pre-wrap text-foreground text-xs leading-relaxed"
                      data-testid="body-before"
                    >
                      {emailParts.bodyBefore}
                    </div>

                    {emailParts.changesSummaryJson && (
                      <div className="space-y-1.5" data-testid="diff-blocks">
                        {(emailParts.changesSummaryJson.added_sessions ?? []).length > 0 && (
                          <div
                            className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800"
                            data-testid="diff-added"
                          >
                            <span className="font-bold text-green-600">+</span>
                            <span>
                              {(emailParts.changesSummaryJson.added_sessions ?? []).length} session
                              {(emailParts.changesSummaryJson.added_sessions ?? []).length > 1
                                ? 's'
                                : ''}{' '}
                              added
                            </span>
                          </div>
                        )}
                        {(emailParts.changesSummaryJson.removed_sessions ?? []).length > 0 && (
                          <div
                            className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800"
                            data-testid="diff-removed"
                          >
                            <span className="font-bold text-red-600">−</span>
                            <span>
                              {(emailParts.changesSummaryJson.removed_sessions ?? []).length} session
                              {(emailParts.changesSummaryJson.removed_sessions ?? []).length > 1
                                ? 's'
                                : ''}{' '}
                              removed
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <div
                      className="whitespace-pre-wrap text-foreground text-xs leading-relaxed"
                      data-testid="body-after"
                    >
                      {emailParts.bodyAfter}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="border-t border-border px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground" data-testid="faculty-count-footer">
            {sendResult
              ? `Sent: ${sendResult.sent}${sendResult.failed > 0 ? `, ${sendResult.failed} failed` : ''}`
              : `${affectedCount} faculty will receive this email`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-md border border-input hover:bg-muted transition-colors"
              data-testid="close-btn"
            >
              Close
            </button>
            <button
              onClick={handleSendAll}
              disabled={isPending || affectedCount === 0 || !!sendResult}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="send-all-btn"
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Send All
            </button>
          </div>
        </div>

        {error && (
          <div
            className="px-4 py-2 text-sm text-destructive bg-destructive/10 border-t border-destructive/20"
            data-testid="error-message"
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
