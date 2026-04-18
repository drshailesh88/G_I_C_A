'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, History, Mail } from 'lucide-react';
import { PreviewEmailsModal } from './preview-emails-modal';

type ChangesSummary = {
  added_sessions?: string[];
  removed_sessions?: string[];
  total_sessions?: number;
  total_assignments?: number;
} | null;

type ProgramVersion = {
  id: string;
  versionNo: number;
  publishedAt: Date | string;
  publishedBy: string;
  changesSummaryJson: unknown;
  changesDescription: string | null;
  publishReason: string | null;
  affectedPersonIdsJson: unknown;
};

function formatIST(dt: Date | string): string {
  return new Date(dt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function parseSummary(raw: unknown): ChangesSummary {
  if (!raw || typeof raw !== 'object') return null;
  return raw as ChangesSummary;
}

function hasAffectedFaculty(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false;
  return raw.length > 0;
}

function VersionCard({
  version,
  onPreview,
}: {
  version: ProgramVersion;
  onPreview: (versionId: string) => void;
}) {
  const summary = parseSummary(version.changesSummaryJson);

  return (
    <div
      className="rounded-lg border border-border bg-card p-4 space-y-3"
      data-testid="version-card"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm" data-testid="version-number">
          Version {version.versionNo}
        </span>
        <span className="text-xs text-muted-foreground" data-testid="published-at">
          {formatIST(version.publishedAt)}
        </span>
      </div>

      <p className="text-sm text-muted-foreground" data-testid="published-by">
        <span className="font-medium text-foreground">Published by: </span>
        {version.publishedBy}
      </p>

      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-sm" data-testid="changes-summary">
          <div className="rounded-md bg-muted px-3 py-2 text-center">
            <div className="text-lg font-bold text-foreground" data-testid="added-count">
              {(summary.added_sessions ?? []).length}
            </div>
            <div className="text-xs text-muted-foreground">Added</div>
          </div>
          <div className="rounded-md bg-muted px-3 py-2 text-center">
            <div className="text-lg font-bold text-foreground" data-testid="removed-count">
              {(summary.removed_sessions ?? []).length}
            </div>
            <div className="text-xs text-muted-foreground">Removed</div>
          </div>
          <div className="rounded-md bg-muted px-3 py-2 text-center">
            <div className="text-lg font-bold text-foreground" data-testid="total-sessions">
              {summary.total_sessions ?? 0}
            </div>
            <div className="text-xs text-muted-foreground">Sessions</div>
          </div>
          <div className="rounded-md bg-muted px-3 py-2 text-center">
            <div className="text-lg font-bold text-foreground" data-testid="total-assignments">
              {summary.total_assignments ?? 0}
            </div>
            <div className="text-xs text-muted-foreground">Assignments</div>
          </div>
        </div>
      )}

      {version.publishReason && (
        <p className="text-sm text-muted-foreground" data-testid="publish-reason">
          <span className="font-medium text-foreground">Reason: </span>
          {version.publishReason}
        </p>
      )}

      {version.changesDescription && (
        <p className="text-sm text-muted-foreground" data-testid="changes-description">
          {version.changesDescription}
        </p>
      )}

      {hasAffectedFaculty(version.affectedPersonIdsJson) && (
        <div className="pt-1">
          <button
            onClick={() => onPreview(version.id)}
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
            data-testid="preview-emails-btn"
          >
            <Mail className="h-3.5 w-3.5" />
            Preview Emails
          </button>
        </div>
      )}
    </div>
  );
}

export function ChangesClient({
  eventId,
  versions,
}: {
  eventId: string;
  versions: ProgramVersion[];
}) {
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const previewVersion = previewVersionId ? versions.find((v) => v.id === previewVersionId) : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href={`/events/${eventId}`}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Back to event workspace"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <History className="h-5 w-5" />
          Program Changes
        </h1>
      </div>

      {versions.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-border p-10 text-center space-y-2"
          data-testid="empty-state"
        >
          <p className="text-sm text-muted-foreground">No versions published yet.</p>
          <p className="text-xs text-muted-foreground">
            When you publish the program, each version will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="versions-list">
          {versions.map((v) => (
            <VersionCard key={v.id} version={v} onPreview={setPreviewVersionId} />
          ))}
        </div>
      )}

      {previewVersionId && previewVersion && (
        <PreviewEmailsModal
          eventId={eventId}
          versionId={previewVersionId}
          versionNo={previewVersion.versionNo}
          isOpen
          onClose={() => setPreviewVersionId(null)}
        />
      )}
    </div>
  );
}
