import { SignIn } from '@clerk/nextjs';

export default function LoginPage() {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* Logo + branding */}
      <div className="flex flex-col items-center gap-2 pb-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary">
          <svg
            viewBox="0 0 24 24"
            className="h-8 w-8 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
            <line x1="12" y1="22" x2="12" y2="15.5" />
            <polyline points="22 8.5 12 15.5 2 8.5" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-text-primary">GEM India</h1>
        <p className="text-sm text-text-secondary">Conference Management Platform</p>
      </div>

      {/* Clerk SignIn component */}
      <SignIn
        appearance={{
          elements: {
            rootBox: 'w-full',
            card: 'shadow-none w-full',
            headerTitle: 'hidden',
            headerSubtitle: 'hidden',
            socialButtonsBlockButton: 'border-border',
            formButtonPrimary: 'bg-primary hover:bg-primary-light',
            footerAction: 'hidden',
          },
        }}
        routing="path"
        path="/login"
        fallbackRedirectUrl="/dashboard"
        signUpUrl="/login"
      />

      <p className="text-xs text-text-muted">Contact your admin for access</p>
    </div>
  );
}
