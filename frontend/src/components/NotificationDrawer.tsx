import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { notificationService } from '../services/notification.service';
import { useNotificationStore } from '../store/useNotificationStore';
import { NotificationItem } from './NotificationItem';
import type { Notification, NotificationListResponse, UnreadCountResponse } from '../types/notification';

interface NotificationDrawerProps {
  page?: number;
}

export const NotificationDrawer = ({ page = 1 }: NotificationDrawerProps) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const notifications = useNotificationStore((state) => state.notifications);
  const unreadNotifications = notifications.filter((n) => !n.isRead);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const isOpen = useNotificationStore((state) => state.isOpen);
  const setNotifications = useNotificationStore((state) => state.setNotifications);
  const setUnreadCount = useNotificationStore((state) => state.setUnreadCount);
  const setDrawerOpen = useNotificationStore((state) => state.setDrawerOpen);
  const markAsRead = useNotificationStore((state) => state.markAsRead);
  const markAllAsRead = useNotificationStore((state) => state.markAllAsRead);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['notifications', page],
    queryFn: () => notificationService.getNotifications(page),
    enabled: isOpen,
  });

  useEffect(() => {
    if (data) setNotifications(data.notifications);
  }, [data, setNotifications]);

  const markAllMutation = useMutation({
    mutationFn: () => notificationService.markAllAsRead(),
    onMutate: () => {
      const previousNotifications = notifications;
      const previousUnreadCount = unreadCount;
      markAllAsRead();
      queryClient.setQueriesData<NotificationListResponse>(
        {
          predicate: (query) =>
            query.queryKey[0] === 'notifications' && typeof query.queryKey[1] === 'number',
        },
        (old) => old
          ? {
              ...old,
              notifications: old.notifications.map((notification) => ({
                ...notification,
                isRead: true,
              })),
            }
          : old,
      );
      queryClient.setQueryData(['notifications', 'infinite'], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            notifications: page.notifications.map((n: Notification) => ({
              ...n,
              isRead: true
            }))
          }))
        };
      });
      queryClient.setQueryData<UnreadCountResponse>(
        ['notifications', 'unreadCount'],
        { unreadCount: 0 },
      );
      return { previousNotifications, previousUnreadCount };
    },
    onError: (_error, _variables, context) => {
      if (context) {
        setNotifications(context.previousNotifications);
        setUnreadCount(context.previousUnreadCount);
      }
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unreadCount'] });
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      const previousNotifications = notifications;
      const previousUnreadCount = unreadCount;
      markAsRead(notification.notificationRecipientId);
      queryClient.setQueriesData<NotificationListResponse>(
        {
          predicate: (query) =>
            query.queryKey[0] === 'notifications' && typeof query.queryKey[1] === 'number',
        },
        (old) => old
          ? {
              ...old,
              notifications: old.notifications.map((item) =>
                item.notificationRecipientId === notification.notificationRecipientId
                  ? { ...item, isRead: true, readAt: new Date().toISOString() }
                  : item,
              ),
            }
          : old,
      );
      queryClient.setQueryData(['notifications', 'infinite'], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            notifications: page.notifications.map((n: Notification) =>
              n.notificationRecipientId === notification.notificationRecipientId
                ? { ...n, isRead: true, readAt: new Date().toISOString() }
                : n
            )
          }))
        };
      });
      queryClient.setQueryData<UnreadCountResponse>(
        ['notifications', 'unreadCount'],
        (old) => ({ unreadCount: Math.max(0, (old?.unreadCount ?? 1) - 1) }),
      );
      void notificationService.markAsRead(notification.notificationRecipientId).catch(() => {
        setNotifications(previousNotifications);
        setUnreadCount(previousUnreadCount);
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['notifications', 'unreadCount'] });
      });
    }

    if (notification.link) {
      setDrawerOpen(false);
      navigate(notification.link);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-neutral-900/20" onClick={() => setDrawerOpen(false)} />
      <aside
        className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-white shadow-2xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Notifications</h2>
            <p className="text-sm text-neutral-500">{unreadNotifications.length} unread notifications</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending || unreadNotifications.length === 0}
              className="px-2 py-1 text-sm text-primary hover:bg-primary/10 rounded disabled:opacity-50"
            >
              Mark all read
            </button>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-500"
              aria-label="Close notifications"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-4 px-5 py-4" aria-label="Loading notifications">
              {[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-neutral-100" />)}
            </div>
          ) : isError ? (
            <div className="px-6 py-16 text-center text-sm text-neutral-500">
              <p>Unable to load notifications.</p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="mt-3 text-sm font-medium text-primary hover:text-primary/80"
              >
                Try again
              </button>
            </div>
          ) : unreadNotifications.length === 0 ? (
            <div className="px-6 py-16 flex flex-col items-center justify-center text-center text-neutral-500">
              <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="font-medium text-neutral-900 mb-1">You're all caught up.</p>
              <p className="text-sm">No unread notifications.</p>
            </div>
          ) : (
            unreadNotifications.map((notification) => (
              <NotificationItem
                key={notification.notificationRecipientId}
                notification={notification}
                onClick={handleNotificationClick}
              />
            ))
          )}
        </div>
      </aside>
    </>
  );
};
