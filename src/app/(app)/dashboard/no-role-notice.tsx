import { UserButton } from '@clerk/nextjs';
import { Shield } from 'lucide-react';

export function NoRoleNotice() {
  return (
    <div className="px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-text-secondary">Welcome</p>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        </div>
        <UserButton afterSignOutUrl="/login" />
      </div>

      <div className="mt-16 flex flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-light">
          <Shield className="h-6 w-6 text-accent" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-text-primary">Access pending</h2>
        <p className="mt-2 max-w-sm text-sm text-text-secondary">
          Welcome! Your administrator will assign your access shortly.
        </p>
      </div>
    </div>
  );
}
