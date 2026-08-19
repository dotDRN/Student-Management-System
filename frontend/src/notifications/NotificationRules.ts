import type { Notification } from "../types/notification";
import type {
  NotificationContext,
  NotificationDecision,
} from "./types";

export class NotificationRules {
  public evaluate(
    notification: Notification,
    context: NotificationContext
  ): NotificationDecision {
    const decision: NotificationDecision = {
      showToast: true,
      showBrowserNotification: false,
      playSound: false,
    };

    switch (notification.type) {
      case "chat_message":
        return this.evaluateChatMessage(notification, context);

      default:
        return decision;
    }
  }

  private evaluateChatMessage(
    notification: Notification,
    context: NotificationContext
  ): NotificationDecision {
    const decision: NotificationDecision = {
      showToast: true,
      showBrowserNotification: false,
      playSound: false,
    };

    // If the user is already viewing this conversation,
    // don't show a toast or browser notification.
    const conversationId = notification.metadata?.conversationId;

    if (
      typeof conversationId === "string" &&
      conversationId === context.activeConversationId
    ) {
      decision.showToast = false;
      decision.showBrowserNotification = false;
      return decision;
    }

    // If the user isn't currently looking at the app,
    // prefer a browser notification instead of a toast.
    if (!context.isTabVisible || !context.isWindowFocused) {
      decision.showToast = false;
      
      if (context.permission === "granted") {
        decision.showBrowserNotification = true;
      }
    }

    return decision;
  }
}

export const notificationRules = new NotificationRules();