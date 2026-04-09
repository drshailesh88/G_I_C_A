'use client';

import { useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { verifyCertificate } from '@/lib/actions/certificate-issuance';

type VerificationResult =
  | { valid: true; certificateNumber: string; certificateType: string; issuedAt: Date }
  | { valid: false; error: string; certificateNumber?: string; revokedAt?: Date | null };

export default function VerifyCertificatePage() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get('token');

  const [token, setToken] = useState(tokenFromUrl ?? '');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [verifying, startVerify] = useTransition();

  function handleVerify() {
    if (!token.trim()) return;
    setResult(null);

    startVerify(async () => {
      try {
        const res = await verifyCertificate(token.trim());
        setResult(res as VerificationResult);
      } catch {
        setResult({ valid: false, error: 'Verification failed. Please try again.' });
      }
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Certificate Verification</h1>
          <p className="mt-1 text-sm text-gray-500">
            Verify the authenticity of a certificate by entering its verification code.
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <div>
              <label htmlFor="token" className="block text-sm font-medium text-gray-700">
                Verification Code
              </label>
              <input
                id="token"
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                placeholder="Enter verification token..."
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={handleVerify}
              disabled={verifying || !token.trim()}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {verifying ? 'Verifying...' : 'Verify Certificate'}
            </button>
          </div>

          {result && (
            <div className="mt-4">
              {result.valid ? (
                <div className="rounded-md bg-green-50 p-4">
                  <p className="text-sm font-medium text-green-800">Certificate is valid</p>
                  <dl className="mt-2 space-y-1 text-xs text-green-700">
                    <div className="flex justify-between">
                      <dt>Certificate Number:</dt>
                      <dd className="font-mono">{result.certificateNumber}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Type:</dt>
                      <dd>{result.certificateType.replace(/_/g, ' ')}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Issued:</dt>
                      <dd>{new Date(result.issuedAt).toLocaleDateString()}</dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <div className="rounded-md bg-red-50 p-4">
                  <p className="text-sm font-medium text-red-800">{result.error}</p>
                  {result.certificateNumber && (
                    <p className="mt-1 text-xs text-red-600">
                      Certificate: {result.certificateNumber}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
