// NotificationRules.ts

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
    // Default decision
    const decision: NotificationDecision = {
      showToast: true,
      showBrowserNotification: false,
      playSound: false,
    };

    // Browser notifications require permission
    if (context.permission !== "granted") {
      return decision;
    }

    // User is currently viewing the same conversation
    if (
      notification.metadata &&
      typeof notification.metadata === "object"
    ) {
      const conversationId =
        notification.metadata["conversationId"];

      if (
        typeof conversationId === "string" &&
        conversationId === context.activeConversationId
      ) {
        decision.showToast = false;
        decision.showBrowserNotification = false;

        return decision;
      }
    }

    // User is away from the tab
    if (!context.isTabVisible || !context.isWindowFocused) {
      decision.showBrowserNotification = true;
    }

    return decision;
  }
}

export const notificationRules =
  new NotificationRules();