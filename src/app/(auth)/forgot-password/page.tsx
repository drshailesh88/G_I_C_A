'use client';

import { useState } from 'react';
import { useSignIn } from '@clerk/nextjs';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const { signIn } = useSignIn();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn) return;

    setLoading(true);
    setError('');

    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email,
      });
      setSent(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-light">
          <svg className="h-8 w-8 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M22 4L12 13L2 4" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Check your email</h1>
          <p className="mt-2 text-sm text-text-secondary">
            We sent a password reset code to <strong>{email}</strong>
          </p>
        </div>
        <Link
          href="/reset-password"
          className="w-full rounded-lg bg-primary px-4 py-3 text-center font-medium text-white hover:bg-primary-light"
        >
          Enter Reset Code
        </Link>
        <button
          onClick={() => { setSent(false); }}
          className="text-sm text-accent hover:underline"
        >
          Resend reset code
        </button>
        <Link href="/login" className="text-sm text-text-secondary hover:underline">
          Back to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h1 className="text-xl font-bold text-text-primary">Forgot password?</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Enter your email and we&apos;ll send you a reset code
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-text-primary">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@organization.com"
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>

        {error && (
          <p className="text-sm text-error">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Send Reset Code'}
        </button>
      </form>

      <Link href="/login" className="text-sm text-text-secondary hover:underline">
        Back to Sign In
      </Link>
    </div>
  );
}
