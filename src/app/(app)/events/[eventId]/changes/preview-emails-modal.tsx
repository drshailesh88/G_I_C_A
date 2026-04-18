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
  changesSummaryJson: {
    added_sessions?: unknown[];
    removed_sessions?: unknown[];
    moved_sessions?: unknown[];
    assignment_changes?: unknown[];
    tba_filled?: unknown[];
    tba_reopened?: unknown[];
  } | null;
  recipientEmail: string | null;
};

type DiffTone = 'green' | 'orange' | 'red';

type DiffBlock = {
  key: string;
  count: number;
  tone: DiffTone;
  icon: string;
  description: string;
  testId: string;
};

function countEntries(entries: unknown): number {
  return Array.isArray(entries) ? entries.length : 0;
}

function buildDiffBlocks(
  changesSummaryJson: EmailParts['changesSummaryJson'],
): DiffBlock[] {
  if (!changesSummaryJson) {
    return [];
  }

  const blocks: DiffBlock[] = [];
  const added = countEntries(changesSummaryJson.added_sessions);
  const moved = countEntries(changesSummaryJson.moved_sessions);
  const assignmentChanges = countEntries(changesSummaryJson.assignment_changes);
  const removed = countEntries(changesSummaryJson.removed_sessions);
  const tbaFilled = countEntries(changesSummaryJson.tba_filled);
  const tbaReopened = countEntries(changesSummaryJson.tba_reopened);

  if (added > 0) {
    blocks.push({
      key: 'added',
      count: added,
      tone: 'green',
      icon: '+',
      description: `${added} session${added === 1 ? '' : 's'} added`,
      testId: 'diff-added',
    });
  }

  if (moved > 0) {
    blocks.push({
      key: 'moved',
      count: moved,
      tone: 'orange',
      icon: '~',
      description: `${moved} session${moved === 1 ? '' : 's'} changed or moved`,
      testId: 'diff-changed',
    });
  }

  if (assignmentChanges > 0) {
    blocks.push({
      key: 'assignment_changes',
      count: assignmentChanges,
      tone: 'orange',
      icon: '~',
      description: `${assignmentChanges} assignment${assignmentChanges === 1 ? '' : 's'} changed`,
      testId: 'diff-assignment-changes',
    });
  }

  if (removed > 0) {
    blocks.push({
      key: 'removed',
      count: removed,
      tone: 'red',
      icon: '−',
      description: `${removed} session${removed === 1 ? '' : 's'} removed`,
      testId: 'diff-removed',
    });
  }

  if (tbaFilled > 0) {
    blocks.push({
      key: 'tba_filled',
      count: tbaFilled,
      tone: 'green',
      icon: '+',
      description: `${tbaFilled} TBA slot${tbaFilled === 1 ? '' : 's'} filled`,
      testId: 'diff-tba-filled',
    });
  }

  if (tbaReopened > 0) {
    blocks.push({
      key: 'tba_reopened',
      count: tbaReopened,
      tone: 'orange',
      icon: '~',
      description: `${tbaReopened} TBA slot${tbaReopened === 1 ? '' : 's'} reopened`,
      testId: 'diff-tba-reopened',
    });
  }

  return blocks;
}

function diffBlockClasses(tone: DiffTone): string {
  if (tone === 'green') {
    return 'bg-green-50 border-green-200 text-green-800';
  }

  if (tone === 'red') {
    return 'bg-red-50 border-red-200 text-red-800';
  }

  return 'bg-orange-50 border-orange-200 text-orange-800';
}

function diffIconClasses(tone: DiffTone): string {
  if (tone === 'green') {
    return 'text-green-600';
  }

  if (tone === 'red') {
    return 'text-red-600';
  }

  return 'text-orange-600';
}

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
  const diffBlocks = buildDiffBlocks(emailParts?.changesSummaryJson ?? null);

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

                    {diffBlocks.length > 0 && (
                      <div className="space-y-1.5" data-testid="diff-blocks">
                        {diffBlocks.map((block) => (
                          <div
                            key={block.key}
                            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${diffBlockClasses(block.tone)}`}
                            data-testid={block.testId}
                          >
                            <span className={`font-bold ${diffIconClasses(block.tone)}`}>{block.icon}</span>
                            <span>{block.description}</span>
                          </div>
                        ))}
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
