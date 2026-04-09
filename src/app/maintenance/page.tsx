export const metadata = { title: 'Maintenance' };

export default function MaintenancePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
          <svg
            className="h-8 w-8 text-amber-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.42 15.17l-5.66-5.66a1.5 1.5 0 010-2.12l.88-.88a1.5 1.5 0 012.12 0l3.16 3.16a.75.75 0 001.06 0l3.16-3.16a1.5 1.5 0 012.12 0l.88.88a1.5 1.5 0 010 2.12l-5.66 5.66a1.5 1.5 0 01-2.12 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.42 15.17L6.75 19.84a1.5 1.5 0 01-2.12 0l-.88-.88a1.5 1.5 0 010-2.12l4.67-4.67"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-text-primary">Under Maintenance</h1>
        <p className="mt-3 max-w-md text-sm text-text-muted">
          GEM India is currently undergoing scheduled maintenance. We&apos;ll be back shortly.
          Please check back in a few minutes.
        </p>
      </div>
    </div>
  );
}
