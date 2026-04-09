'use client';

import { useState, useTransition, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { verifyCertificate } from '@/lib/actions/certificate-issuance';

type VerificationResult =
  | { valid: true; certificateNumber: string; certificateType: string; issuedAt: Date }
  | { valid: false; error: string; certificateNumber?: string; revokedAt?: Date | null };

function VerifyContent() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get('token');

  const [token, setToken] = useState(tokenFromUrl ?? '');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [verifying, startVerify] = useTransition();
  const [hasAutoVerified, setHasAutoVerified] = useState(false);

  function handleVerify(verifyToken?: string) {
    const t = (verifyToken ?? token).trim();
    if (!t) return;
    setResult(null);

    startVerify(async () => {
      try {
        const res = await verifyCertificate(t);
        setResult(res as VerificationResult);
      } catch {
        setResult({ valid: false, error: 'Verification failed. Please check the code and try again.' });
      }
    });
  }

  // Auto-verify if token is in URL
  useEffect(() => {
    if (tokenFromUrl && !hasAutoVerified) {
      setHasAutoVerified(true);
      handleVerify(tokenFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenFromUrl, hasAutoVerified]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 px-4 py-12">
      <div className="w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900">
            Certificate Verification
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Verify the authenticity of a GEM India conference certificate
          </p>
        </div>

        {/* Search Card */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <div>
              <label htmlFor="verify-token" className="block text-sm font-medium text-gray-700">
                Verification Code
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="verify-token"
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                  placeholder="Enter the UUID from the certificate QR code"
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  autoFocus={!tokenFromUrl}
                />
                <button
                  onClick={() => handleVerify()}
                  disabled={verifying || !token.trim()}
                  className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {verifying ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Verifying
                    </span>
                  ) : 'Verify'}
                </button>
              </div>
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className="mt-6">
              {result.valid ? (
                <div className="rounded-lg bg-green-50 border border-green-200 p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-200">
                      <svg className="h-5 w-5 text-green-700" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-green-800">
                        Certificate Verified
                      </h3>
                      <p className="mt-1 text-sm text-green-700">
                        This certificate is authentic and currently valid.
                      </p>
                      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        <dt className="text-green-600">Certificate Number</dt>
                        <dd className="font-mono font-medium text-green-800">{result.certificateNumber}</dd>
                        <dt className="text-green-600">Type</dt>
                        <dd className="font-medium text-green-800">{result.certificateType.replace(/_/g, ' ')}</dd>
                        <dt className="text-green-600">Issued On</dt>
                        <dd className="font-medium text-green-800">{new Date(result.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-red-50 border border-red-200 p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-200">
                      <svg className="h-5 w-5 text-red-700" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-red-800">
                        Verification Failed
                      </h3>
                      <p className="mt-1 text-sm text-red-700">{result.error}</p>
                      {result.certificateNumber && (
                        <p className="mt-2 text-xs text-red-600">
                          Certificate: <span className="font-mono">{result.certificateNumber}</span>
                        </p>
                      )}
                      {result.revokedAt && (
                        <p className="mt-1 text-xs text-red-600">
                          Revoked on: {new Date(result.revokedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400">
          GEM India Conference Management Platform
        </p>
      </div>
    </div>
  );
}

export default function VerifyCertificatePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    }>
      <VerifyContent />
    </Suspense>
  );
}
