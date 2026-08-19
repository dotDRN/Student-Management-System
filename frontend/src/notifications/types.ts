import type { Notification } from "../types/notification";

export type NotificationType =
  | "chat_message"
  | "reaction"
  | "mention"
  | "voice_call"
  | "video_call"
  | "announcement"
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