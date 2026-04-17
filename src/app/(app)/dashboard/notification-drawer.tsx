'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { X, Mail, MessageCircle } from 'lucide-react';
import {
  getRecentNotifications,
  markAllNotificationsRead,
  type RecentNotificationItem,
} from '@/lib/actions/dashboard';

type Filter = 'all' | 'unread' | 'failed';

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mq.matches);
    const listener = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);
  return isDesktop;
}

function relativeTime(date: Date | string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'sent': return 'Sent';
    case 'delivered': return 'Delivered';
    case 'read': return 'Read';
    case 'failed': return 'Failed';
    case 'retrying': return 'Retrying';
    case 'queued': return 'Queued';
    case 'sending': return 'Sending';
    default: return status;
  }
}

interface NotificationDrawerProps {
  eventId: string;
  open: boolean;
  onClose: () => void;
  onUnreadCountChange: (count: number) => void;
}

export function NotificationDrawer({
  eventId,
  open,
  onClose,
  onUnreadCountChange,
}: NotificationDrawerProps) {
  const isDesktop = useIsDesktop();
  const [items, setItems] = useState<RecentNotificationItem[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !eventId) return;
    setIsLoading(true);
    getRecentNotifications(eventId)
      .then(({ items: fetched, unreadCount }) => {
        setItems(fetched);
        onUnreadCountChange(unreadCount);
      })
      .finally(() => setIsLoading(false));
  }, [open, eventId, onUnreadCountChange]);

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllNotificationsRead(eventId);
      const { items: fetched, unreadCount } = await getRecentNotifications(eventId);
      setItems(fetched);
      onUnreadCountChange(unreadCount);
    });
  }

  const localUnreadCount = items.filter((i) => i.isUnread).length;

  const visibleItems = items.filter((item) => {
    if (filter === 'unread') return item.isUnread;
    if (filter === 'failed') return item.status === 'failed';
    return true;
  });

  if (!open) return null;

  const drawerClass = isDesktop
    ? 'fixed top-0 right-0 h-full w-[360px] z-50 bg-white shadow-xl flex flex-col'
    : 'fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl flex flex-col max-h-[85vh]';

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className={drawerClass} role="dialog" aria-label="Notifications">
        {!isDesktop && (
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-1 w-10 rounded-full bg-border" />
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Notifications</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handleMarkAllRead}
              disabled={isPending || localUnreadCount === 0}
              className="text-sm text-primary disabled:opacity-40"
            >
              Mark all read
            </button>
            {isDesktop && (
              <button
                onClick={onClose}
                className="rounded p-1 hover:bg-border/50"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-text-secondary" />
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2 px-4 pt-3 pb-2">
          {(['all', 'unread', 'failed'] as Filter[]).map((f) => {
            const label =
              f === 'unread'
                ? `Unread${localUnreadCount > 0 ? ` (${localUnreadCount})` : ''}`
                : f === 'failed'
                ? 'Failed'
                : 'All';
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                data-testid={`filter-${f}`}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  filter === f
                    ? 'bg-text-primary text-white'
                    : 'text-text-secondary hover:bg-border/50'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <p className="py-8 text-center text-sm text-text-secondary">Loading…</p>
          )}
          {!isLoading && visibleItems.length === 0 && (
            <p className="py-8 text-center text-sm text-text-secondary">No notifications</p>
          )}
          {!isLoading &&
            visibleItems.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 border-b border-border/50 px-4 py-3"
              >
                <div className="mt-1.5 h-2 w-2 shrink-0">
                  {item.isUnread && <div className="h-2 w-2 rounded-full bg-orange-500" />}
                </div>

                <div className="mt-0.5 shrink-0">
                  {item.channel === 'email' ? (
                    <Mail className="h-4 w-4 text-blue-500" />
                  ) : (
                    <MessageCircle className="h-4 w-4 text-green-500" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-medium ${
                      item.isUnread ? 'text-text-primary' : 'text-text-secondary'
                    }`}
                  >
                    {item.subject}
                  </p>
                  <p className="truncate text-xs text-text-secondary">
                    To: {item.recipientName}
                    {item.recipientContact ? ` · ${item.recipientContact}` : ''}
                  </p>
                  <p
                    className={`mt-0.5 text-xs ${
                      item.status === 'failed' ? 'text-red-600' : 'text-text-secondary'
                    }`}
                  >
                    {relativeTime(item.queuedAt)} ·{' '}
                    {item.channel === 'email' ? 'Email' : 'WhatsApp'} ·{' '}
                    {statusLabel(item.status)}
                  </p>
                </div>
              </div>
            ))}
        </div>

        <div className="border-t border-border px-4 py-3">
          <Link
            href={`/events/${eventId}/communications`}
            onClick={onClose}
            className="block text-center text-sm font-medium text-primary hover:underline"
          >
            View all notifications
          </Link>
        </div>
      </div>
    </>
  );
}
