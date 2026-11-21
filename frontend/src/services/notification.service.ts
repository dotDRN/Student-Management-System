import api from './api';
import { withOfflineRead } from '../offline/offlineServiceHelper';
import type {
  Notification,
  NotificationListResponse,
  UnreadCountResponse,
} from '../types/notification';

interface NotificationRecipientResponse {
  id: string;
  notificationId: string;
  recipientId: string;
  isRead: boolean;
  readAt?: string | null;
  notification: Omit<Notification, 'notificationRecipientId' | 'notificationId' | 'recipientId' | 'isRead' | 'readAt'>;
}

const toNotification = (recipient: NotificationRecipientResponse): Notification => ({
  notificationRecipientId: recipient.id,
  notificationId: recipient.notificationId,
  recipientId: recipient.recipientId,
  isRead: recipient.isRead,
  readAt: recipient.readAt,
  ...recipient.notification,
});

class NotificationService {
  async getNotifications(page: number = 1, unreadOnly = false): Promise<NotificationListResponse> {
    return withOfflineRead<NotificationListResponse>(
      async () => {
        const response = await api.get<{
          notifications: NotificationRecipientResponse[];
          pagination: NotificationListResponse['pagination'];
        }>('/notifications', {
          params: { page, unreadOnly },
        });

        return {
          notifications: response.data.notifications.map(toNotification),
          pagination: response.data.pagination,
        };
      },
      async () => ({
        notifications: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
      }),
    );
  }

  async getUnreadCount(): Promise<UnreadCountResponse> {
    return withOfflineRead<UnreadCountResponse>(
      async () => {
        const response = await api.get<UnreadCountResponse>('/notifications/unread-count');
        return response.data;
      },
      async () => ({ unreadCount: 0 }),
    );
  }

  async markAsRead(notificationRecipientId: string): Promise<void> {
    await api.patch(`/notifications/${notificationRecipientId}/read`);
  }

  async markAllAsRead(): Promise<void> {
    await api.patch('/notifications/read-all');
  }

  async archiveNotification(notificationRecipientId: string): Promise<void> {
    await api.patch(`/notifications/${notificationRecipientId}/archive`);
  }
}

export const notificationService = new NotificationService();
