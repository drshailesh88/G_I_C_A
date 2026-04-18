'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import { updateFieldConfig } from '@/lib/actions/event';
import { STANDARD_TOGGLE_FIELDS, CUSTOM_FIELD_TYPES } from '@/lib/validations/event';
import type { CustomField } from '@/lib/validations/event';

const STANDARD_FIELD_LABELS: Record<string, string> = {
  designation: 'Designation',
  specialty: 'Specialty',
  organization: 'Organization / Hospital',
  city: 'City',
  age: 'Age',
};

const CUSTOM_TYPE_LABELS: Record<string, string> = {
  text: 'Short Text',
  number: 'Number',
  select: 'Dropdown (Select)',
  date: 'Date',
  file: 'File Upload',
};

type EventRow = {
  id: string;
  name: string;
  fieldConfig: unknown;
};

type ParsedFieldConfig = {
  standardFields: Record<string, boolean>;
  customFields: CustomField[];
};

function parseFieldConfig(raw: unknown): ParsedFieldConfig {
  const fc = (raw ?? {}) as Record<string, unknown>;
  const sf = (fc.standardFields ?? {}) as Record<string, boolean>;
  const cf = Array.isArray(fc.customFields) ? (fc.customFields as CustomField[]) : [];
  return {
    standardFields: Object.fromEntries(
      STANDARD_TOGGLE_FIELDS.map((f) => [f, sf[f] !== false]),
    ),
    customFields: cf,
  };
}

function generateId(): string {
  return crypto.randomUUID();
}

export function FieldBuilderClient({
  event,
  canWrite,
}: {
  event: EventRow;
  canWrite: boolean;
}) {
  const parsed = parseFieldConfig(event.fieldConfig);
  const [standardFields, setStandardFields] = useState<Record<string, boolean>>(
    parsed.standardFields,
  );
  const [customFields, setCustomFields] = useState<CustomField[]>(parsed.customFields);
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleStandard(field: string) {
    if (!canWrite) return;
    setStandardFields((prev) => ({ ...prev, [field]: !prev[field] }));
    setSuccess(false);
  }

  function addCustomField() {
    if (!canWrite || customFields.length >= 10) return;
    setCustomFields((prev) => [
      ...prev,
      { id: generateId(), type: 'text', label: '', required: false },
    ]);
    setSuccess(false);
  }

  function removeCustomField(id: string) {
    if (!canWrite) return;
    setCustomFields((prev) => prev.filter((f) => f.id !== id));
    setSuccess(false);
  }

  function updateCustomField(id: string, updates: Partial<CustomField>) {
    if (!canWrite) return;
    setCustomFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    );
    setSuccess(false);
  }

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canWrite) return;
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await updateFieldConfig(event.id, {
        standardFields,
        customFields,
      });
      if (result.ok) {
        setSuccess(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/events/${event.id}`}
          className="text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Event Fields</h1>
          <p className="text-sm text-text-secondary">{event.name}</p>
        </div>
      </div>

      {!canWrite && (
        <div className="mb-4 rounded-lg border border-border bg-surface p-3">
          <p className="text-sm text-text-secondary">
            Read-only view. Only Event Coordinators and Super Admins can configure fields.
          </p>
        </div>
      )}

      <form onSubmit={handleSave}>
        {/* Standard Fields Section */}
        <section className="mb-8">
          <h2 className="text-base font-semibold text-text-primary mb-1">Standard Fields</h2>
          <p className="text-sm text-text-secondary mb-4">
            Full Name, Email, and Phone are always required. Toggle the rest on or off.
          </p>

          <div className="rounded-xl border border-border divide-y divide-border">
            {/* Always-on fields */}
            {(['fullName', 'email', 'phone'] as const).map((field) => (
              <div key={field} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-text-primary">
                  {field === 'fullName' ? 'Full Name' : field === 'email' ? 'Email' : 'Phone'}
                </span>
                <span className="text-xs text-text-muted bg-surface px-2 py-0.5 rounded-full border border-border">
                  Required
                </span>
              </div>
            ))}

            {/* Toggleable standard fields */}
            {STANDARD_TOGGLE_FIELDS.map((field) => (
              <div key={field} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-text-primary">{STANDARD_FIELD_LABELS[field]}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={standardFields[field]}
                  disabled={!canWrite}
                  onClick={() => toggleStandard(field)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-50 ${
                    standardFields[field] ? 'bg-primary' : 'bg-border'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      standardFields[field] ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Custom Fields Section */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-semibold text-text-primary">Custom Fields</h2>
            <span className="text-xs text-text-muted">{customFields.length}/10</span>
          </div>
          <p className="text-sm text-text-secondary mb-4">
            Add up to 10 custom fields to collect event-specific information.
          </p>

          {customFields.length > 0 && (
            <div className="space-y-3 mb-4">
              {customFields.map((field) => (
                <CustomFieldCard
                  key={field.id}
                  field={field}
                  canWrite={canWrite}
                  onChange={(updates) => updateCustomField(field.id, updates)}
                  onRemove={() => removeCustomField(field.id)}
                />
              ))}
            </div>
          )}

          {canWrite && (
            <button
              type="button"
              onClick={addCustomField}
              disabled={customFields.length >= 10}
              className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2.5 text-sm text-text-secondary hover:border-primary hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-full justify-center"
            >
              <Plus className="h-4 w-4" />
              Add Custom Field
            </button>
          )}
        </section>

        {/* Feedback */}
        {error && (
          <div className="mb-4 rounded-lg border border-error/20 bg-error/5 p-3">
            <p className="text-sm text-error">{error}</p>
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="text-sm text-green-700">Field configuration saved.</p>
          </div>
        )}

        {canWrite && (
          <button
            type="submit"
            disabled={isPending}
            className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-primary-light disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isPending ? 'Saving…' : 'Save Configuration'}
          </button>
        )}
      </form>
    </div>
  );
}

function CustomFieldCard({
  field,
  canWrite,
  onChange,
  onRemove,
}: {
  field: CustomField;
  canWrite: boolean;
  onChange: (updates: Partial<CustomField>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-3">
          {/* Label */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Field Label <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={field.label}
              disabled={!canWrite}
              placeholder="e.g. Years of experience"
              maxLength={100}
              onChange={(e) => onChange({ label: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
            />
          </div>

          <div className="flex gap-3">
            {/* Type */}
            <div className="flex-1">
              <label className="block text-xs font-medium text-text-secondary mb-1">Type</label>
              <select
                value={field.type}
                disabled={!canWrite}
                onChange={(e) =>
                  onChange({
                    type: e.target.value as CustomField['type'],
                    options: e.target.value === 'select' ? (field.options ?? []) : undefined,
                  })
                }
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              >
                {CUSTOM_FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CUSTOM_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            {/* Required */}
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 text-xs font-medium text-text-secondary cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={field.required}
                  disabled={!canWrite}
                  onChange={(e) => onChange({ required: e.target.checked })}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary disabled:opacity-60"
                />
                Required
              </label>
            </div>
          </div>

          {/* Options (for select type) */}
          {field.type === 'select' && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Options (one per line)
              </label>
              <textarea
                value={(field.options ?? []).join('\n')}
                disabled={!canWrite}
                rows={3}
                placeholder="Option 1&#10;Option 2&#10;Option 3"
                onChange={(e) =>
                  onChange({
                    options: e.target.value
                      .split('\n')
                      .map((o) => o.trim())
                      .filter(Boolean),
                  })
                }
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60 resize-none"
              />
            </div>
          )}
        </div>

        {canWrite && (
          <button
            type="button"
            onClick={onRemove}
            className="mt-1 p-1.5 rounded-lg text-text-muted hover:text-error hover:bg-error/5 transition-colors"
            aria-label="Remove field"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
