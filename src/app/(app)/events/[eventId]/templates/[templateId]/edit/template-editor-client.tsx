'use client';

import { useState, useRef, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Mail, MessageCircle, Save } from 'lucide-react';
import { saveTemplate } from '@/lib/actions/notifications';

type TemplateRow = {
  id: string;
  eventId: string | null;
  templateKey: string;
  channel: string;
  templateName: string;
  status: string;
  subjectLine: string | null;
  bodyContent: string;
  previewText: string | null;
  allowedVariablesJson: unknown;
  requiredVariablesJson: unknown;
  notes: string | null;
  versionNo: number;
};

type Props = {
  eventId: string;
  primaryTemplate: TemplateRow;
  siblingTemplate: TemplateRow | null;
  canWrite: boolean;
};

type FormState = {
  templateName: string;
  subjectLine: string;
  bodyContent: string;
  previewText: string;
  status: 'draft' | 'active' | 'archived';
  notes: string;
};

function toForm(t: TemplateRow): FormState {
  return {
    templateName: t.templateName,
    subjectLine: t.subjectLine ?? '',
    bodyContent: t.bodyContent,
    previewText: t.previewText ?? '',
    status: t.status as FormState['status'],
    notes: t.notes ?? '',
  };
}

function getAllowedVars(t: TemplateRow): string[] {
  const v = t.allowedVariablesJson;
  return Array.isArray(v) ? (v as string[]) : [];
}

function getRequiredVars(t: TemplateRow): Set<string> {
  const v = t.requiredVariablesJson;
  return new Set(Array.isArray(v) ? (v as string[]) : []);
}

function TemplatePanel({
  template,
  disabled,
  form,
  onChange,
}: {
  template: TemplateRow;
  disabled: boolean;
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
}) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const allowedVars = getAllowedVars(template);
  const requiredVars = getRequiredVars(template);
  const isEmail = template.channel === 'email';

  function insertVariable(varName: string) {
    const ta = bodyRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const snippet = `{{${varName}}}`;
    const newValue = ta.value.slice(0, start) + snippet + ta.value.slice(end);
    onChange({ bodyContent: newValue });
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + snippet.length, start + snippet.length);
    }, 0);
  }

  return (
    <div className="flex flex-col gap-4" data-testid={`panel-${template.channel}`}>
      {/* Channel header */}
      <div className="flex items-center gap-2">
        {isEmail
          ? <Mail className="h-4 w-4 text-text-secondary" />
          : <MessageCircle className="h-4 w-4 text-text-secondary" />}
        <span className="text-sm font-semibold text-text-primary">
          {isEmail ? 'Email' : 'WhatsApp'}
        </span>
        <span className="ml-1 text-xs text-text-muted">v{template.versionNo}</span>
        {template.eventId === null && (
          <span className="ml-auto rounded-full border border-border/70 px-2 py-0.5 text-xs text-text-muted">
            Global template — saving will create an event override
          </span>
        )}
      </div>

      {/* Template name */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Name</span>
        <input
          type="text"
          value={form.templateName}
          onChange={(e) => onChange({ templateName: e.target.value })}
          disabled={disabled}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`name-${template.channel}`}
        />
      </label>

      {/* Status */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Status</span>
        <select
          value={form.status}
          onChange={(e) => onChange({ status: e.target.value as FormState['status'] })}
          disabled={disabled}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`status-select-${template.channel}`}
        >
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </label>

      {/* Subject line (email only) */}
      {isEmail && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Subject line
          </span>
          <input
            type="text"
            value={form.subjectLine}
            onChange={(e) => onChange({ subjectLine: e.target.value })}
            disabled={disabled}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="subject-line"
          />
        </label>
      )}

      {/* Preview text (email only) */}
      {isEmail && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Preview text
          </span>
          <input
            type="text"
            value={form.previewText}
            onChange={(e) => onChange({ previewText: e.target.value })}
            disabled={disabled}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="preview-text"
          />
        </label>
      )}

      {/* Variable chips */}
      {allowedVars.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Variables <span className="normal-case font-normal">(click to insert)</span>
          </p>
          <div
            className="flex flex-wrap gap-1.5"
            data-testid={`variable-chips-${template.channel}`}
          >
            {allowedVars.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => insertVariable(v)}
                disabled={disabled}
                className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2 py-0.5 text-xs text-text-secondary hover:bg-border/30 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid={`chip-${v}`}
              >
                <code className="font-mono">{`{{${v}}}`}</code>
                {requiredVars.has(v) && (
                  <span className="text-destructive" aria-label="required" data-testid="required-star">
                    *
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Body content */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {isEmail ? 'Email body (HTML)' : 'Message body'}
        </span>
        <textarea
          ref={bodyRef}
          value={form.bodyContent}
          onChange={(e) => onChange({ bodyContent: e.target.value })}
          disabled={disabled}
          rows={14}
          className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`body-${template.channel}`}
        />
      </label>

      {/* Notes */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Notes</span>
        <textarea
          value={form.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          disabled={disabled}
          rows={3}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`notes-${template.channel}`}
        />
      </label>
    </div>
  );
}

export function TemplateEditorClient({
  eventId,
  primaryTemplate,
  siblingTemplate,
  canWrite,
}: Props) {
  const router = useRouter();
  const [primaryForm, setPrimaryForm] = useState<FormState>(() => toForm(primaryTemplate));
  const [siblingForm, setSiblingForm] = useState<FormState | null>(() =>
    siblingTemplate ? toForm(siblingTemplate) : null,
  );
  const [isPending, startTransition] = useTransition();
  const [savedOk, setSavedOk] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function handleSave() {
    setSaveError(null);
    setSavedOk(false);
    startTransition(async () => {
      try {
        const primaryResult = await saveTemplate({
          eventId,
          templateId: primaryTemplate.id,
          templateName: primaryForm.templateName,
          subjectLine: primaryTemplate.channel === 'email' ? (primaryForm.subjectLine || null) : undefined,
          bodyContent: primaryForm.bodyContent,
          previewText: primaryTemplate.channel === 'email' ? (primaryForm.previewText || null) : undefined,
          status: primaryForm.status,
          notes: primaryForm.notes || null,
        });

        if (siblingTemplate && siblingForm) {
          await saveTemplate({
            eventId,
            templateId: siblingTemplate.id,
            templateName: siblingForm.templateName,
            subjectLine: siblingTemplate.channel === 'email' ? (siblingForm.subjectLine || null) : undefined,
            bodyContent: siblingForm.bodyContent,
            previewText: siblingTemplate.channel === 'email' ? (siblingForm.previewText || null) : undefined,
            status: siblingForm.status,
            notes: siblingForm.notes || null,
          });
        }

        setSavedOk(true);

        // If a global template was forked to an event override, navigate to the new URL
        if (primaryResult.templateId !== primaryTemplate.id) {
          router.replace(`/events/${eventId}/templates/${primaryResult.templateId}/edit`);
        }
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Save failed');
      }
    });
  }

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/events/${eventId}/templates`}
            className="rounded-lg p-1.5 hover:bg-border/50"
            data-testid="back-link"
          >
            <ArrowLeft className="h-5 w-5 text-text-primary" />
          </Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Template Editor
            </p>
            <h1 className="text-lg font-bold text-text-primary">
              {primaryTemplate.templateName}
            </h1>
          </div>
        </div>

        {canWrite && (
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-60"
            data-testid="save-button"
          >
            <Save className="h-4 w-4" />
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </div>

      {/* Feedback */}
      {savedOk && (
        <div
          className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
          data-testid="save-success"
        >
          Template saved successfully.
        </div>
      )}
      {saveError && (
        <div
          className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          data-testid="save-error"
        >
          {saveError}
        </div>
      )}

      {/* Read-only notice */}
      {!canWrite && (
        <div
          className="mt-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-muted"
          data-testid="readonly-notice"
        >
          You have read-only access. Template editing is not permitted.
        </div>
      )}

      {/* Editor panels — side-by-side when sibling exists */}
      <div
        className={`mt-6 grid gap-8 ${siblingTemplate ? 'lg:grid-cols-2' : 'max-w-2xl'}`}
        data-testid="editor-panels"
      >
        <TemplatePanel
          template={primaryTemplate}
          disabled={!canWrite || isPending}
          form={primaryForm}
          onChange={(patch) => setPrimaryForm((prev) => ({ ...prev, ...patch }))}
        />
        {siblingTemplate && siblingForm && (
          <TemplatePanel
            template={siblingTemplate}
            disabled={!canWrite || isPending}
            form={siblingForm}
            onChange={(patch) => setSiblingForm((prev) => prev ? { ...prev, ...patch } : prev)}
          />
        )}
      </div>
    </div>
  );
}
