'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { registerForEvent } from '@/lib/actions/registration';
import { FormGrid } from '@/components/responsive/form-grid';

export function RegisterPageClient({
  eventId,
  eventName,
  startDate,
  endDate,
  venueName,
  registrationOpen,
}: {
  eventId: string;
  eventName: string;
  startDate: string | null;
  endDate: string | null;
  venueName: string | null;
  registrationOpen: boolean;
}) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      fullName: (formData.get('fullName') as string).trim(),
      email: (formData.get('email') as string).trim(),
      phone: (formData.get('phone') as string).trim(),
      designation: (formData.get('designation') as string).trim(),
      specialty: (formData.get('specialty') as string).trim(),
      organization: (formData.get('organization') as string).trim(),
      city: (formData.get('city') as string).trim(),
      age: formData.get('age') ? Number(formData.get('age')) : undefined,
      preferences: {},
    };

    try {
      await registerForEvent(eventId, data);
      setSuccess(true);
    } catch (err) {
      if (err instanceof Error) {
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

  if (success) {
    return (
      <div className="px-4 py-6">
        <h1 className="text-xl font-bold text-text-primary">Registration Complete</h1>
        <p className="mt-2 text-text-secondary">You have been registered for {eventName}.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Register</h1>
        <p className="text-sm text-text-secondary">{eventName}</p>
        {venueName && <p className="text-xs text-text-muted">{venueName}</p>}
      </div>

      {!registrationOpen && (
        <div className="mt-4 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-medium text-text-secondary">Registration closed</p>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-error/20 bg-error/5 p-3">
          <p className="text-sm text-error">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6">
        <fieldset disabled={!registrationOpen}>
          <FormGrid columns={2}>
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
            <FormField
              name="phone"
              label="Mobile Number"
              type="tel"
              required
              error={fieldErrors.phone}
              placeholder="+91 98765 43210"
            />
            <FormField
              name="designation"
              label="Designation"
              error={fieldErrors.designation}
              placeholder="Senior Consultant"
            />
            <div className="col-span-full">
              <FormField
                name="specialty"
                label="Specialty"
                error={fieldErrors.specialty}
                placeholder="Gastroenterology"
              />
            </div>
            <div className="col-span-full">
              <FormField
                name="organization"
                label="Organization / Hospital"
                error={fieldErrors.organization}
                placeholder="AIIMS Delhi"
              />
            </div>
            <FormField
              name="city"
              label="City"
              error={fieldErrors.city}
              placeholder="New Delhi"
            />
            <FormField
              name="age"
              label="Age"
              type="number"
              error={fieldErrors.age}
              placeholder="35"
            />
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
