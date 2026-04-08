'use client';

import { useState } from 'react';
import { useSignIn } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const { signIn, setActive } = useSignIn();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn || !setActive) return;

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid code or password';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h1 className="text-xl font-bold text-text-primary">Reset password</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Enter the code from your email and your new password
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <div>
          <label htmlFor="code" className="mb-1 block text-sm font-medium text-text-primary">
            Reset Code
          </label>
          <input
            id="code"
            type="text"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter code from email"
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-text-primary">
            New Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>

        <div>
          <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-text-primary">
            Confirm Password
          </label>
          <input
            id="confirm"
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat new password"
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
          {loading ? 'Resetting...' : 'Reset Password'}
        </button>
      </form>

      <Link href="/login" className="text-sm text-text-secondary hover:underline">
        Back to Sign In
      </Link>
    </div>
  );
}
