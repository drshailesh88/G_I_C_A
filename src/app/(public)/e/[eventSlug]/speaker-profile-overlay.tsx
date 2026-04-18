'use client';

import { useEffect, useRef } from 'react';
import { X, User } from 'lucide-react';
import type { PublicSpeaker } from '@/lib/actions/speaker-profile';

type SpeakerProfileOverlayProps = {
  speaker: PublicSpeaker | null;
  onClose: () => void;
};

function formatSessionTime(
  startAtUtc: Date | string | null,
  endAtUtc: Date | string | null,
): string | null {
  if (!startAtUtc) return null;
  const opts: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  };
  const start = new Date(startAtUtc).toLocaleTimeString('en-IN', opts);
  if (!endAtUtc) return `${start} IST`;
  const end = new Date(endAtUtc).toLocaleTimeString('en-IN', opts);
  return `${start} – ${end} IST`;
}

function formatSessionDate(sessionDate: Date | string | null): string | null {
  if (!sessionDate) return null;
  return new Date(sessionDate).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

export function SpeakerProfileOverlay({ speaker, onClose }: SpeakerProfileOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!speaker) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [speaker, onClose]);

  if (!speaker) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
        data-testid="speaker-overlay-backdrop"
      />

      {/* Panel: bottom sheet on mobile, centered modal on desktop */}
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="speaker-profile-name"
        className="fixed bottom-0 left-0 right-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white shadow-xl md:bottom-auto md:left-1/2 md:top-1/2 md:w-[640px] md:max-h-[80vh] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl"
        data-testid="speaker-overlay"
      >
        {/* Mobile drag handle */}
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-gray-200 md:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-4 pb-2">
          <h2 className="text-base font-semibold text-text-primary">Speaker Profile</h2>
          <button
            onClick={onClose}
            aria-label="Close speaker profile"
            className="rounded-lg p-1.5 text-text-muted hover:bg-border/50"
            data-testid="speaker-overlay-close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body: stacked on mobile, two-column on desktop */}
        <div className="px-6 pb-6 md:grid md:grid-cols-[200px_1fr] md:gap-8">
          {/* Left column: identity */}
          <div className="flex flex-col items-center py-4 text-center md:py-2">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100"
              data-testid="speaker-avatar"
            >
              <User className="h-10 w-10 text-gray-400" />
            </div>
            <h3
              id="speaker-profile-name"
              className="mt-3 text-lg font-semibold text-text-primary"
              data-testid="speaker-name"
            >
              {speaker.fullName}
            </h3>
            {speaker.designation && (
              <p className="mt-0.5 text-sm text-text-secondary" data-testid="speaker-designation">
                {speaker.designation}
              </p>
            )}
            {speaker.organization && (
              <p className="text-sm text-text-muted" data-testid="speaker-organization">
                {speaker.organization}
              </p>
            )}
          </div>

          {/* Right column: bio + sessions */}
          <div className="space-y-5 py-4 md:py-2">
            {speaker.bio && (
              <div data-testid="speaker-bio-section">
                <h4 className="mb-2 text-sm font-semibold text-text-primary">About</h4>
                <p
                  className="text-sm leading-relaxed text-text-secondary"
                  data-testid="speaker-bio"
                >
                  {speaker.bio}
                </p>
              </div>
            )}

            {speaker.sessions.length > 0 && (
              <div data-testid="speaker-sessions-section">
                <h4 className="mb-3 text-sm font-semibold text-text-primary">
                  Sessions at this event
                </h4>
                <div className="space-y-2">
                  {speaker.sessions.map((session) => {
                    const date = formatSessionDate(session.sessionDate);
                    const time = formatSessionTime(session.startAtUtc, session.endAtUtc);
                    const metaParts = [date, time, session.hallName].filter(Boolean);
                    return (
                      <div
                        key={session.sessionId}
                        className="rounded-xl border border-border bg-surface p-3.5"
                        data-testid="speaker-session-card"
                      >
                        <p className="text-sm font-medium text-text-primary">{session.title}</p>
                        {metaParts.length > 0 && (
                          <p className="mt-1 text-xs text-text-muted">
                            {metaParts.join(' · ')}
                          </p>
                        )}
                        <span
                          className="mt-2 inline-block rounded-full bg-accent-light px-2 py-0.5 text-xs font-medium capitalize text-accent"
                          data-testid="speaker-session-role"
                        >
                          {session.role}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
