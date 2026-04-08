'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { updateFacultyInviteStatus } from '@/lib/actions/program';

type Event = {
  id: string;
  name: string;
  slug: string;
  startDate: Date;
  endDate: Date;
  venueName: string | null;
};

type Invite = {
  id: string;
  eventId: string;
  personId: string;
  token: string;
  status: string;
  sentAt: Date;
  respondedAt: Date | null;
};

export function FacultyConfirmClient({
  event,
  invite,
  token,
  eventSlug,
}: {
  event: Event;
  invite: Invite;
  token: string;
  eventSlug: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const isTerminal = ['accepted', 'declined', 'expired'].includes(invite.status);

  async function handleResponse(action: 'accepted' | 'declined') {
    setError('');
    startTransition(async () => {
      try {
        await updateFacultyInviteStatus(invite.eventId, {
          inviteId: invite.id,
          newStatus: action,
        });
        if (action === 'accepted') {
          router.push(`/e/${eventSlug}/confirm/success`);
        } else {
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit response');
      }
    });
  }

  const dateRange = `${new Date(event.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`;

  return (
    <div className="px-4 py-8">
      {/* Event Header */}
      <div className="rounded-xl bg-primary px-6 py-6 text-center">
        <h1 className="text-lg font-bold text-white">{event.name}</h1>
        <p className="mt-1 text-xs text-white/70">Faculty Participation Confirmation</p>
      </div>

      <div className="mt-8 px-2">
        {/* Terminal state messages */}
        {invite.status === 'accepted' && (
          <div className="mb-6 flex flex-col items-center rounded-xl bg-success/10 p-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-success" />
            <p className="mt-3 text-lg font-bold text-text-primary">Already Confirmed</p>
            <p className="mt-1 text-sm text-text-secondary">
              You have already accepted this invitation.
            </p>
          </div>
        )}

        {invite.status === 'declined' && (
          <div className="mb-6 flex flex-col items-center rounded-xl bg-error/10 p-6 text-center">
            <XCircle className="h-12 w-12 text-error" />
            <p className="mt-3 text-lg font-bold text-text-primary">Invitation Declined</p>
            <p className="mt-1 text-sm text-text-secondary">
              You have declined this invitation.
            </p>
          </div>
        )}

        {invite.status === 'expired' && (
          <div className="mb-6 flex flex-col items-center rounded-xl bg-border p-6 text-center">
            <XCircle className="h-12 w-12 text-text-muted" />
            <p className="mt-3 text-lg font-bold text-text-primary">Invitation Expired</p>
            <p className="mt-1 text-sm text-text-secondary">
              This invitation has expired. Please contact the organizers.
            </p>
          </div>
        )}

        {/* Active invite (sent or opened) */}
        {!isTerminal && (
          <>
            <p className="text-text-secondary">Dear Faculty Member,</p>
            <p className="mt-4 text-sm text-text-secondary">
              You have been invited to participate in <strong>{event.name}</strong>.
            </p>

            {/* Event details card */}
            <div className="mt-6 rounded-xl border border-border bg-surface p-4">
              <p className="text-sm font-semibold text-text-primary">{event.name}</p>
              <p className="mt-1 text-xs text-text-muted">{dateRange}</p>
              {event.venueName && (
                <p className="text-xs text-text-muted">{event.venueName}</p>
              )}
            </div>

            <p className="mt-6 text-sm text-text-secondary">
              Please confirm your participation using the buttons below.
            </p>

            {/* Error */}
            {error && (
              <div className="mt-4 rounded-lg border border-error/20 bg-error/5 p-3">
                <p className="text-sm text-error">{error}</p>
              </div>
            )}

            {/* Action buttons */}
            <div className={cn('mt-6 space-y-3', isPending && 'pointer-events-none opacity-50')}>
              <button
                onClick={() => handleResponse('accepted')}
                disabled={isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
              >
                <CheckCircle2 className="h-5 w-5" />
                Accept & Confirm
              </button>
              <button
                onClick={() => handleResponse('declined')}
                disabled={isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-medium text-text-secondary hover:bg-surface disabled:opacity-50"
              >
                Decline Invitation
              </button>
            </div>
          </>
        )}

        {/* Contact info */}
        <p className="mt-8 text-center text-xs text-text-muted">
          Questions? Contact the event organizers.
        </p>
      </div>
    </div>
  );
}
