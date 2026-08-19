import { create } from 'zustand';
import type { Notification } from '../types/notification';
import { notificationPermission } from '../notifications/NotificationPermission';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isOpen: boolean;
  browserNotificationsEnabled: boolean;

  setNotifications: (notifications: Notification[]) => void;
  addNotification: (notification: Notification) => void;
  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
  decrementUnread: () => void;
  markAsRead: (notificationRecipientId: string) => void;
  markAllAsRead: () => void;
  setDrawerOpen: (isOpen: boolean) => void;
  setBrowserNotificationsEnabled: (enabled: boolean) => void;
  clear: () => void;
}

const getInitialBrowserPreference = () => {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem('browserNotificationsEnabled');
  if (stored !== null) {
    return stored === 'true';
  }
  return notificationPermission.isGranted();
};

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  isOpen: false,
  browserNotificationsEnabled: getInitialBrowserPreference(),

  setNotifications: (notifications) => set((state) => {
    const notificationsByRecipientId = new Map(
      notifications.map((notification) => [notification.notificationRecipientId, notification]),
    );

    // Preserve socket events received while a REST request was in flight.
    for (const notification of state.notifications) {
      if (!notificationsByRecipientId.has(notification.notificationRecipientId)) {
        notificationsByRecipientId.set(notification.notificationRecipientId, notification);
      }
    }

    return {
      notifications: [...notificationsByRecipientId.values()].sort(
        (first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
      ),
    };
  }),

  addNotification: (notification) => set((state) => {
    if (state.notifications.some((item) => item.notificationRecipientId === notification.notificationRecipientId)) {
      return state;
    }

    return { notifications: [notification, ...state.notifications] };
  }),

  setUnreadCount: (count) => set({ unreadCount: Math.max(0, count) }),

  incrementUnread: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),

  decrementUnread: () => set((state) => ({ unreadCount: Math.max(0, state.unreadCount - 1) })),

  markAsRead: (notificationRecipientId) => set((state) => {
    const notification = state.notifications.find(
      (item) => item.notificationRecipientId === notificationRecipientId,
    );

    if (!notification || notification.isRead) return state;

    return {
      notifications: state.notifications.map((item) =>
        item.notificationRecipientId === notificationRecipientId
          ? { ...item, isRead: true, readAt: new Date().toISOString() }
          : item,
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    };
  }),

  markAllAsRead: () => set((state) => ({
    notifications: state.notifications.map((item) => ({
      ...item,
      isRead: true,
      readAt: item.readAt ?? new Date().toISOString(),
    })),
    unreadCount: 0,
  })),

  setDrawerOpen: (isOpen) => set({ isOpen }),

  setBrowserNotificationsEnabled: (enabled) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('browserNotificationsEnabled', enabled.toString());
    }
    set({ browserNotificationsEnabled: enabled });
  },

  clear: () => set({ notifications: [], unreadCount: 0, isOpen: false }),
}));
