'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { registerForEvent } from '@/lib/actions/registration';
import { FormGrid } from '@/components/responsive/form-grid';
import type { CustomField } from '@/lib/validations/event';

const STANDARD_TOGGLE_FIELDS = ['designation', 'specialty', 'organization', 'city', 'age'] as const;

type ParsedFieldConfig = {
  standardFields: Record<string, boolean>;
  customFields: CustomField[];
};

type FileFieldValue = {
  name: string;
  size: number;
  type: string | null;
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

export function serializeCustomFieldValue(
  field: CustomField,
  rawValue: FormDataEntryValue | null,
): string | number | FileFieldValue | undefined {
  if (rawValue === null || rawValue === '') {
    return undefined;
  }

  if (field.type === 'number') {
    return Number(rawValue);
  }

  if (field.type === 'file') {
    if (!(rawValue instanceof File) || !rawValue.name) {
      return undefined;
    }

    return {
      name: rawValue.name,
      size: rawValue.size,
      type: rawValue.type || null,
    };
  }

  return String(rawValue);
}

export function RegistrationFormClient({
  eventId,
  eventSlug,
  eventName,
  registrationOpen,
  fieldConfig,
}: {
  eventId: string;
  eventSlug: string;
  eventName: string;
  registrationOpen: boolean;
  fieldConfig?: unknown;
}) {
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { standardFields, customFields } = parseFieldConfig(fieldConfig);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);

    // Collect custom field values into preferences
    const preferences: Record<string, unknown> = {};
    for (const cf of customFields) {
      const value = serializeCustomFieldValue(cf, formData.get(`custom_${cf.id}`));
      if (value !== undefined) {
        preferences[`custom_${cf.id}`] = value;
      }
    }

    const data = {
      fullName: (formData.get('fullName') as string).trim(),
      email: (formData.get('email') as string).trim(),
      phone: (formData.get('phone') as string).trim(),
      designation: standardFields.designation
        ? (formData.get('designation') as string | null)?.trim() || undefined
        : undefined,
      specialty: standardFields.specialty
        ? (formData.get('specialty') as string | null)?.trim() || undefined
        : undefined,
      organization: standardFields.organization
        ? (formData.get('organization') as string | null)?.trim() || undefined
        : undefined,
      city: standardFields.city
        ? (formData.get('city') as string | null)?.trim() || undefined
        : undefined,
      age:
        standardFields.age && formData.get('age')
          ? Number(formData.get('age'))
          : undefined,
      preferences,
    };

    try {
      const result = await registerForEvent(eventId, data);
      // Pass only registrationId — success page fetches details server-side
      router.push(`/e/${eventSlug}/register/success?id=${result.registrationId}`);
    } catch (err) {
      if (err instanceof Error) {
        // Check for Zod validation errors
        if (err.message.includes('Validation error')) {
          try {
            const parsed = JSON.parse(err.message.replace('Validation error: ', ''));
            const errors: Record<string, string> = {};
            for (const issue of parsed) {
              errors[issue.path?.[0] || 'form'] = issue.message;
            }
            setFieldErrors(errors);
          } catch {
            setError(err.message);
          }
        } else {
          setError(err.message);
        }
      } else {
        setError('Registration failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/e/${eventSlug}`}
          className="text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Register</h1>
          <p className="text-sm text-text-secondary">{eventName}</p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mt-4 rounded-lg border border-error/20 bg-error/5 p-3">
          <p className="text-sm text-error">{error}</p>
        </div>
      )}

      {!registrationOpen && (
        <div className="mt-4 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-medium text-text-secondary">Registration closed</p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="mt-6">
        <fieldset disabled={!registrationOpen}>
          <FormGrid columns={2}>
            {/* Always-on: fullName + email */}
            <FormField
              name="fullName"
              label="Full Name"
              required
              error={fieldErrors.fullName}
              placeholder="Dr. Rajesh Kumar"
            />
            <FormField
              name="email"
              label="Email"
              type="email"
              required
              error={fieldErrors.email}
              placeholder="rajesh@hospital.org"
            />

            {/* Always-on: phone */}
            <FormField
              name="phone"
              label="Mobile Number"
              type="tel"
              required
              error={fieldErrors.phone}
              placeholder="+91 98765 43210"
            />

            {/* Conditionally rendered standard fields */}
            {standardFields.designation && (
              <FormField
                name="designation"
                label="Designation"
                error={fieldErrors.designation}
                placeholder="Senior Consultant"
              />
            )}

            {standardFields.specialty && (
              <div className="col-span-full">
                <FormField
                  name="specialty"
                  label="Specialty"
                  error={fieldErrors.specialty}
                  placeholder="Gastroenterology"
                />
              </div>
            )}

            {standardFields.organization && (
              <div className="col-span-full">
                <FormField
                  name="organization"
                  label="Organization / Hospital"
                  error={fieldErrors.organization}
                  placeholder="AIIMS Delhi"
                />
              </div>
            )}

            {standardFields.city && (
              <FormField
                name="city"
                label="City"
                error={fieldErrors.city}
                placeholder="New Delhi"
              />
            )}

            {standardFields.age && (
              <FormField
                name="age"
                label="Age"
                type="number"
                error={fieldErrors.age}
                placeholder="35"
              />
            )}

            {/* Custom fields */}
            {customFields.map((cf) => (
              <div key={cf.id} className={cf.type === 'select' ? 'col-span-full' : ''}>
                <CustomFormField field={cf} error={fieldErrors[`custom_${cf.id}`]} />
              </div>
            ))}
          </FormGrid>

          <button
            type="submit"
            disabled={!isHydrated || isSubmitting || !registrationOpen}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-base font-semibold text-white hover:bg-primary-light disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Registering...
              </>
            ) : (
              'Complete Registration'
            )}
          </button>

          <p className="mt-4 text-center text-xs text-text-secondary">
            By registering you agree to our{' '}
            <Link href="/terms" className="text-primary hover:underline">
              Terms &amp; Privacy Policy
            </Link>
          </p>
        </fieldset>
      </form>
    </div>
  );
}

function FormField({
  name,
  label,
  type = 'text',
  required = false,
  error,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  error?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-text-primary">
        {label}
        {required && <span className="text-error"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  );
}

function CustomFormField({
  field,
  error,
}: {
  field: CustomField;
  error?: string;
}) {
  const inputName = `custom_${field.id}`;
  const labelEl = (
    <label htmlFor={inputName} className="block text-sm font-medium text-text-primary">
      {field.label}
      {field.required && <span className="text-error"> *</span>}
    </label>
  );

  if (field.type === 'select') {
    return (
      <div>
        {labelEl}
        <select
          id={inputName}
          name={inputName}
          required={field.required}
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">Select…</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {error && <p className="mt-1 text-xs text-error">{error}</p>}
      </div>
    );
  }

  if (field.type === 'file') {
    return (
      <div>
        {labelEl}
        <input
          id={inputName}
          name={inputName}
          type="file"
          required={field.required}
          className="mt-1 w-full text-sm text-text-primary file:mr-4 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text-secondary hover:file:bg-border"
        />
        {error && <p className="mt-1 text-xs text-error">{error}</p>}
      </div>
    );
  }

  const inputType =
    field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text';

  return (
    <div>
      {labelEl}
      <input
        id={inputName}
        name={inputName}
        type={inputType}
        required={field.required}
        className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  );
}
