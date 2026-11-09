import type { Notification } from "../types/notification";

export type NotificationType =
  | "chat_message"
  | "chat_reply"
  | "chat_mention"
  | "announcement"
  | "incoming_call"
  | "missed_call"
  | "system";

export interface NotificationContext {
  permission: NotificationPermission;
  isTabVisible: boolean;
  isWindowFocused: boolean;
  activeConversationId?: string | null;
  browserNotificationsEnabled: boolean;
}

export interface NotificationDecision {
  showToast: boolean;
  showBrowserNotification: boolean;
  playSound: boolean;
}

export interface NotificationDispatchInput {
  notification: Notification;
  context: NotificationContext;
}

export interface NotificationAction {
  url?: string;
  conversationId?: string;
  entityId?: string;
}
