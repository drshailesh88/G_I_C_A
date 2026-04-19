'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { ArrowLeft, Plus, Pencil, Trash2, Mail, MessageCircle, Zap, ToggleLeft, ToggleRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  createAutomationTrigger,
  updateAutomationTrigger,
  deleteAutomationTrigger,
} from '@/lib/actions/notifications';

type TriggerRow = {
  id: string;
  triggerEventType: string;
  channel: string;
  templateId: string;
  recipientResolution: string;
  delaySeconds: number;
  idempotencyScope: string;
  isEnabled: boolean;
  notes: string | null;
  priority: number | null;
  createdAt: Date;
};

type NotificationTemplate = {
  id: string;
  templateName: string;
  channel: string;
  eventId: string | null;
};

type TriggerFormValues = {
  triggerEventType: string;
  channel: string;
  templateId: string;
  recipientResolution: string;
  delaySeconds: string;
  notes: string;
  priority: string;
};

type Props = {
  eventId: string;
  triggers: TriggerRow[];
  templates: NotificationTemplate[];
  canWrite: boolean;
};

const TRIGGER_EVENT_TYPES = [
  'registration.created',
  'registration.cancelled',
  'faculty.invitation',
  'program.version_published',
  'session.cancelled',
  'travel.saved',
  'travel.updated',
  'travel.cancelled',
  'accommodation.saved',
  'accommodation.updated',
  'accommodation.cancelled',
  'transport.updated',
  'certificate.generated',
] as const;

const TRIGGER_EVENT_LABELS: Record<string, string> = {
  'registration.created': 'Registration Created',
  'registration.cancelled': 'Registration Cancelled',
  'faculty.invitation': 'Faculty Invitation',
  'program.version_published': 'Program Published',
  'session.cancelled': 'Session Cancelled',
  'travel.saved': 'Travel Saved',
  'travel.updated': 'Travel Updated',
  'travel.cancelled': 'Travel Cancelled',
  'accommodation.saved': 'Accommodation Saved',
  'accommodation.updated': 'Accommodation Updated',
  'accommodation.cancelled': 'Accommodation Cancelled',
  'transport.updated': 'Transport Updated',
  'certificate.generated': 'Certificate Generated',
};

const RECIPIENT_RESOLUTIONS = [
  'trigger_person',
  'session_faculty',
  'event_faculty',
  'ops_team',
] as const;

const RECIPIENT_RESOLUTION_LABELS: Record<string, string> = {
  trigger_person: 'Trigger Person',
  session_faculty: 'Session Faculty',
  event_faculty: 'All Faculty',
  ops_team: 'Ops Team',
};

const EMPTY_FORM: TriggerFormValues = {
  triggerEventType: '',
  channel: '',
  templateId: '',
  recipientResolution: '',
  delaySeconds: '0',
  notes: '',
  priority: '',
};

function TriggerForm({
  mode,
  trigger,
  form,
  templates,
  isPending,
  error,
  onChange,
  onSubmit,
  onCancel,
}: {
  mode: 'add' | 'edit';
  trigger?: TriggerRow;
  form: TriggerFormValues;
  templates: NotificationTemplate[];
  isPending: boolean;
  error: string | null;
  onChange: (patch: Partial<TriggerFormValues>) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const isEdit = mode === 'edit';
  const templatesForChannel = templates.filter((t) => t.channel === (isEdit ? trigger?.channel : form.channel));

  return (
    <div
      className="rounded-xl border border-primary/30 bg-surface p-4 shadow-sm"
      data-testid={isEdit ? 'edit-trigger-form' : 'add-trigger-form'}
    >
      <h3 className="mb-3 text-sm font-semibold text-text-primary">
        {isEdit ? 'Edit Trigger' : 'New Automation Trigger'}
      </h3>

      <div className="space-y-3">
        {/* Trigger event type — fixed after creation */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            When this event occurs <span className="text-red-500">*</span>
          </label>
          {isEdit ? (
            <p className="rounded-lg bg-border/20 px-3 py-2 text-sm text-text-primary">
              {TRIGGER_EVENT_LABELS[trigger?.triggerEventType ?? ''] ?? trigger?.triggerEventType}
            </p>
          ) : (
            <select
              value={form.triggerEventType}
              onChange={(e) => onChange({ triggerEventType: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
              data-testid="input-trigger-event-type"
            >
              <option value="">Select event type…</option>
              {TRIGGER_EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TRIGGER_EVENT_LABELS[t] ?? t}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Channel — fixed after creation */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            Channel <span className="text-red-500">*</span>
          </label>
          {isEdit ? (
            <p className="rounded-lg bg-border/20 px-3 py-2 text-sm capitalize text-text-primary">
              {trigger?.channel}
            </p>
          ) : (
            <select
              value={form.channel}
              onChange={(e) => onChange({ channel: e.target.value, templateId: '' })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
              data-testid="input-channel"
            >
              <option value="">Select channel…</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          )}
        </div>

        {/* Template */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            Template <span className="text-red-500">*</span>
          </label>
          <select
            value={form.templateId}
            onChange={(e) => onChange({ templateId: e.target.value })}
            disabled={!isEdit && !form.channel}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none disabled:opacity-50"
            data-testid="input-template-id"
          >
            <option value="">Select template…</option>
            {templatesForChannel.map((t) => (
              <option key={t.id} value={t.id}>
                {t.templateName}
              </option>
            ))}
          </select>
        </div>

        {/* Recipient resolution */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            Send to <span className="text-red-500">*</span>
          </label>
          <select
            value={form.recipientResolution}
            onChange={(e) => onChange({ recipientResolution: e.target.value })}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
            data-testid="input-recipient-resolution"
          >
            <option value="">Select recipient…</option>
            {RECIPIENT_RESOLUTIONS.map((r) => (
              <option key={r} value={r}>
                {RECIPIENT_RESOLUTION_LABELS[r]}
              </option>
            ))}
          </select>
        </div>

        {/* Delay */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            Delay (seconds)
          </label>
          <input
            type="number"
            min={0}
            max={86400}
            value={form.delaySeconds}
            onChange={(e) => onChange({ delaySeconds: e.target.value })}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
            data-testid="input-delay-seconds"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
            data-testid="input-notes"
          />
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-600" data-testid="form-error">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={onSubmit}
          disabled={isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-primary/90"
          data-testid="form-submit"
        >
          {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Trigger'}
        </button>
        <button
          onClick={onCancel}
          disabled={isPending}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary disabled:opacity-50 hover:border-accent/50"
          data-testid="form-cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function TriggersClient({ eventId, triggers, templates, canWrite }: Props) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [formValues, setFormValues] = useState<TriggerFormValues>(EMPTY_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const templateMap = new Map(templates.map((t) => [t.id, t.templateName]));

  function openAdd() {
    setEditingId('new');
    setFormValues(EMPTY_FORM);
    setFormError(null);
    setActionError(null);
  }

  function openEdit(trigger: TriggerRow) {
    setEditingId(trigger.id);
    setFormValues({
      triggerEventType: trigger.triggerEventType,
      channel: trigger.channel,
      templateId: trigger.templateId,
      recipientResolution: trigger.recipientResolution,
      delaySeconds: String(trigger.delaySeconds),
      notes: trigger.notes ?? '',
      priority: trigger.priority != null ? String(trigger.priority) : '',
    });
    setFormError(null);
    setActionError(null);
  }

  function cancelForm() {
    setEditingId(null);
    setFormError(null);
  }

  function patchForm(patch: Partial<TriggerFormValues>) {
    setFormValues((prev) => ({ ...prev, ...patch }));
  }

  function handleSubmitAdd() {
    if (!formValues.triggerEventType || !formValues.channel || !formValues.templateId || !formValues.recipientResolution) {
      setFormError('Event type, channel, template, and recipient are required.');
      return;
    }
    startTransition(async () => {
      try {
        await createAutomationTrigger({
          eventId,
          triggerEventType: formValues.triggerEventType,
          channel: formValues.channel,
          templateId: formValues.templateId,
          recipientResolution: formValues.recipientResolution,
          delaySeconds: parseInt(formValues.delaySeconds, 10) || 0,
          notes: formValues.notes || null,
          priority: formValues.priority ? parseInt(formValues.priority, 10) : null,
        });
        setEditingId(null);
      } catch {
        setFormError('Failed to create trigger. Check that the template belongs to this event.');
      }
    });
  }

  function handleSubmitEdit(triggerId: string) {
    if (!formValues.templateId || !formValues.recipientResolution) {
      setFormError('Template and recipient are required.');
      return;
    }
    startTransition(async () => {
      try {
        const result = await updateAutomationTrigger({
          eventId,
          triggerId,
          templateId: formValues.templateId,
          recipientResolution: formValues.recipientResolution,
          delaySeconds: parseInt(formValues.delaySeconds, 10) || 0,
          notes: formValues.notes || null,
          priority: formValues.priority ? parseInt(formValues.priority, 10) : null,
        });
        if (!result.ok) {
          setFormError(result.error);
          return;
        }
        setEditingId(null);
      } catch {
        setFormError('Failed to update trigger.');
      }
    });
  }

  function handleToggle(trigger: TriggerRow) {
    startTransition(async () => {
      try {
        const result = await updateAutomationTrigger({
          eventId,
          triggerId: trigger.id,
          isEnabled: !trigger.isEnabled,
        });
        if (!result.ok) setActionError(result.error);
      } catch {
        setActionError('Failed to update trigger.');
      }
    });
  }

  function handleDelete(triggerId: string) {
    startTransition(async () => {
      try {
        const result = await deleteAutomationTrigger({ eventId, triggerId });
        if (!result.ok) setActionError(result.error);
        else setDeleteConfirmId(null);
      } catch {
        setActionError('Failed to delete trigger.');
      }
    });
  }

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/events/${eventId}/templates`}
            className="rounded-lg p-1.5 hover:bg-border/50"
            data-testid="back-link"
          >
            <ArrowLeft className="h-5 w-5 text-text-primary" />
          </Link>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            <h1 className="text-lg font-bold text-text-primary">Automation Triggers</h1>
          </div>
        </div>
        {canWrite && editingId === null && (
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90"
            data-testid="add-trigger-btn"
          >
            <Plus className="h-4 w-4" />
            Add Trigger
          </button>
        )}
      </div>

      {/* Global action error */}
      {actionError && (
        <div
          className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
          data-testid="action-error"
        >
          {actionError}
          <button
            className="ml-2 underline"
            onClick={() => setActionError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Add trigger form */}
      {editingId === 'new' && (
        <div className="mt-4">
          <TriggerForm
            mode="add"
            form={formValues}
            templates={templates}
            isPending={isPending}
            error={formError}
            onChange={patchForm}
            onSubmit={handleSubmitAdd}
            onCancel={cancelForm}
          />
        </div>
      )}

      {/* Triggers list */}
      <div className="mt-4 space-y-3">
        {triggers.length === 0 && editingId !== 'new' ? (
          <div
            className="rounded-xl border border-border bg-surface p-8 text-center"
            data-testid="triggers-empty"
          >
            <Zap className="mx-auto mb-3 h-8 w-8 text-text-muted" />
            <p className="text-sm font-medium text-text-primary">No automation triggers yet</p>
            <p className="mt-1 text-xs text-text-secondary">
              Add a trigger to automatically send notifications when domain events occur.
            </p>
          </div>
        ) : (
          triggers.map((trigger) => {
            if (editingId === trigger.id) {
              return (
                <TriggerForm
                  key={trigger.id}
                  mode="edit"
                  trigger={trigger}
                  form={formValues}
                  templates={templates}
                  isPending={isPending}
                  error={formError}
                  onChange={patchForm}
                  onSubmit={() => handleSubmitEdit(trigger.id)}
                  onCancel={cancelForm}
                />
              );
            }

            const templateName = templateMap.get(trigger.templateId) ?? 'Unknown template';
            const isBeingDeleted = deleteConfirmId === trigger.id;

            return (
              <div
                key={trigger.id}
                className={cn(
                  'rounded-xl border bg-surface p-4 transition-colors',
                  trigger.isEnabled ? 'border-border' : 'border-border/50 opacity-60',
                )}
                data-testid="trigger-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Event type */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800"
                        data-testid="trigger-event-type"
                      >
                        {TRIGGER_EVENT_LABELS[trigger.triggerEventType] ?? trigger.triggerEventType}
                      </span>
                      <span className="flex items-center gap-1 rounded-full bg-border/40 px-2.5 py-0.5 text-xs text-text-secondary">
                        {trigger.channel === 'email' ? (
                          <Mail className="h-3 w-3" />
                        ) : (
                          <MessageCircle className="h-3 w-3" />
                        )}
                        {trigger.channel === 'email' ? 'Email' : 'WhatsApp'}
                      </span>
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-xs font-medium',
                          trigger.isEnabled
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-500',
                        )}
                        data-testid="trigger-status"
                      >
                        {trigger.isEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>

                    {/* Template & recipient */}
                    <p className="mt-2 text-sm font-medium text-text-primary" data-testid="trigger-template-name">
                      {templateName}
                    </p>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      {RECIPIENT_RESOLUTION_LABELS[trigger.recipientResolution] ?? trigger.recipientResolution}
                      {trigger.delaySeconds > 0 && ` · ${trigger.delaySeconds}s delay`}
                    </p>

                    {trigger.notes && (
                      <p className="mt-1 text-xs italic text-text-muted">{trigger.notes}</p>
                    )}
                  </div>

                  {/* Actions */}
                  {canWrite && (
                    <div className="flex shrink-0 items-center gap-1">
                      {/* Toggle enable/disable */}
                      <button
                        onClick={() => handleToggle(trigger)}
                        disabled={isPending}
                        title={trigger.isEnabled ? 'Disable trigger' : 'Enable trigger'}
                        className="rounded-lg p-1.5 text-text-muted hover:bg-border/50 disabled:opacity-40"
                        data-testid={trigger.isEnabled ? 'disable-trigger-btn' : 'enable-trigger-btn'}
                      >
                        {trigger.isEnabled ? (
                          <ToggleRight className="h-4.5 w-4.5 text-green-600" />
                        ) : (
                          <ToggleLeft className="h-4.5 w-4.5" />
                        )}
                      </button>

                      {/* Edit */}
                      <button
                        onClick={() => openEdit(trigger)}
                        disabled={isPending}
                        title="Edit trigger"
                        className="rounded-lg p-1.5 text-text-muted hover:bg-border/50 disabled:opacity-40"
                        data-testid="edit-trigger-btn"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => setDeleteConfirmId(trigger.id)}
                        disabled={isPending}
                        title="Delete trigger"
                        className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 disabled:opacity-40"
                        data-testid="delete-trigger-btn"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Delete confirmation */}
                {isBeingDeleted && (
                  <div
                    className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
                    data-testid="delete-confirm"
                  >
                    <p>Delete this trigger? Future matching events will not send this notification.</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => handleDelete(trigger.id)}
                        disabled={isPending}
                        className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50 hover:bg-red-700"
                        data-testid="confirm-delete-btn"
                      >
                        {isPending ? 'Deleting…' : 'Delete'}
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        disabled={isPending}
                        className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-600 disabled:opacity-50"
                        data-testid="cancel-delete-btn"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
