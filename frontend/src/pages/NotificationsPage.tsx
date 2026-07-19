import React, { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { isToday, isYesterday, isThisWeek, isThisMonth } from 'date-fns';
import { Bell } from 'lucide-react';
import { notificationService } from '../services/notification.service';
import { useNotificationStore } from '../store/useNotificationStore';
import { NotificationItem } from '../components/NotificationItem';
import type { Notification } from '../types/notification';

const groupNotifications = (notifications: Notification[]) => {
  const groups: Record<string, Notification[]> = {
    'Today': [],
    'Yesterday': [],
    'Earlier This Week': [],
    'Earlier This Month': [],
    'Older': []
  };

  notifications.forEach(notification => {
    const date = new Date(notification.createdAt);
    if (isToday(date)) {
      groups['Today'].push(notification);
    } else if (isYesterday(date)) {
      groups['Yesterday'].push(notification);
    } else if (isThisWeek(date)) {
      groups['Earlier This Week'].push(notification);
    } else if (isThisMonth(date)) {
      groups['Earlier This Month'].push(notification);
    } else {
      groups['Older'].push(notification);
    }
  });

  return groups;
};

export const NotificationsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const markAsRead = useNotificationStore(state => state.markAsRead);
  
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ['notifications', 'infinite'],
    queryFn: ({ pageParam = 1 }) => notificationService.getNotifications(pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      // If we've loaded fewer items than total, fetch the next page
      const loadedCount = allPages.reduce((acc, page) => acc + page.notifications.length, 0);
      if (loadedCount < lastPage.pagination.total) {
        return allPages.length + 1;
      }
      return undefined;
    }
  });

  // Keep history page in sync with realtime events and read actions
  // The useChatSocket sets query data for ['notifications', <number>].
  // We handle marking as read here for the infinite list explicitly.
  
  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      // Optimistically mark as read in store and query caches
      markAsRead(notification.notificationRecipientId);
      
      // Update infinite query cache
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

      // Update regular queries (for drawer)
      queryClient.setQueriesData<any>(
        { predicate: (query) => query.queryKey[0] === 'notifications' && typeof query.queryKey[1] === 'number' },
        (old: any) => old ? {
          ...old,
          notifications: old.notifications.map((n: Notification) => 
            n.notificationRecipientId === notification.notificationRecipientId
              ? { ...n, isRead: true, readAt: new Date().toISOString() }
              : n
          )
        } : old
      );

      // Decrement unread count
      queryClient.setQueryData<any>(['notifications', 'unreadCount'], (old: any) => 
        ({ unreadCount: Math.max(0, (old?.unreadCount ?? 1) - 1) })
      );

      notificationService.markAsRead(notification.notificationRecipientId).catch(() => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      });
    }

    if (notification.link) {
      navigate(notification.link);
    }
  };

  const notifications = useMemo(() => {
    return data?.pages.flatMap(page => page.notifications) || [];
  }, [data]);

  const groupedNotifications = useMemo(() => groupNotifications(notifications), [notifications]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-neutral-50 h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-neutral-50 h-full">
        <p className="text-neutral-500 mb-4">Unable to load notifications.</p>
        <button 
          onClick={() => queryClient.invalidateQueries({ queryKey: ['notifications', 'infinite'] })}
          className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center text-brand-600">
              <Bell size={20} />
            </div>
            <h1 className="text-xl font-bold text-neutral-900" style={{ fontFamily: 'var(--font-heading)' }}>
              Notifications
            </h1>
          </div>
        </div>

        {notifications.length === 0 ? (
          <div className="px-6 py-20 flex flex-col items-center justify-center text-center text-neutral-500">
            <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mb-4">
              <Bell size={32} className="text-neutral-300" />
            </div>
            <p className="font-medium text-lg text-neutral-900 mb-2">No notifications yet</p>
            <p className="text-sm max-w-sm">When you get notifications, they'll show up here.</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {Object.entries(groupedNotifications).map(([groupName, groupNotifs]) => {
              if (groupNotifs.length === 0) return null;
              
              return (
                <div key={groupName} className="py-4">
                  <h3 className="px-6 pb-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    {groupName}
                  </h3>
                  <div>
                    {groupNotifs.map(notification => (
                      <NotificationItem 
                        key={notification.notificationRecipientId}
                        notification={notification}
                        onClick={handleNotificationClick}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            
            {hasNextPage && (
              <div className="p-6 flex justify-center">
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="px-6 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {isFetchingNextPage ? 'Loading more...' : 'Load More'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
