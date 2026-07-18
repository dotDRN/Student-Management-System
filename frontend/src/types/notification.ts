export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Notification {
  notificationRecipientId: string;
  notificationId: string;
  recipientId: string;
  type: string;
  title: string;
  body: string;
  priority: NotificationPriority;
  entityType?: string | null;
  entityId?: string | null;
  link?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  isRead: boolean;
  readAt?: string | null;
}

export interface UnreadCountResponse {
  unreadCount: number;
}

export interface NotificationListResponse {
  notifications: Notification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}
