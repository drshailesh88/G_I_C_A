'use client';

import { UserButton } from '@clerk/nextjs';
import { Bell, Plus, Upload, FileBarChart } from 'lucide-react';
import Link from 'next/link';

export function DashboardClient() {
  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-text-secondary">Good Morning</p>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          <button className="rounded-full p-2 hover:bg-border/50">
            <Bell className="h-5 w-5 text-text-secondary" />
          </button>
          <UserButton afterSignOutUrl="/login" />
        </div>
      </div>

      {/* Event Selector */}
      <div className="mt-4 rounded-xl bg-primary px-4 py-3">
        <p className="text-xs text-white/70">Active Event</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-white">No event selected</p>
            <p className="text-xs text-white/70">Create your first event to get started</p>
          </div>
          <svg className="h-5 w-5 text-white/70" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <MetricCard icon="users" value="0" label="Delegates" />
        <MetricCard icon="graduation" value="0" label="Faculty" />
        <MetricCard icon="mail" value="0" label="Emails Sent" />
        <MetricCard icon="message" value="0" label="WA Sent" />
      </div>

      {/* Quick Actions */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Quick Actions</h2>
        <div className="grid grid-cols-3 gap-3">
          <Link
            href="/events/new"
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4 hover:border-accent"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-light">
              <Plus className="h-5 w-5 text-accent" />
            </div>
            <span className="text-xs font-medium text-text-primary">Create Event</span>
          </Link>
          <Link
            href="/people/import"
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4 hover:border-accent"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-light">
              <Upload className="h-5 w-5 text-accent" />
            </div>
            <span className="text-xs font-medium text-text-primary">Import People</span>
          </Link>
          <Link
            href="/reports"
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4 hover:border-accent"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-light">
              <FileBarChart className="h-5 w-5 text-accent" />
            </div>
            <span className="text-xs font-medium text-text-primary">Reports</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, value, label }: { icon: string; value: string; label: string }) {
  const iconMap: Record<string, React.ReactNode> = {
    users: (
      <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
    graduation: (
      <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" />
      </svg>
    ),
    mail: (
      <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 4L12 13L2 4" />
      </svg>
    ),
    message: (
      <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        {iconMap[icon]}
      </div>
      <p className="mt-2 text-2xl font-bold text-text-primary">{value}</p>
      <p className="text-xs text-text-secondary">{label}</p>
    </div>
  );
}
