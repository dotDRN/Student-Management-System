import type { Notification } from "../types/notification";
import { browserNotification } from "./BrowserNotificationService";
import { notificationRules } from "./NotificationRules";
import { notificationVisibility } from "./NotificationVisibility";

export interface NotificationActions {
  showToast?: (notification: Notification) => void;
  navigate?: (path: string) => void;
}

export class NotificationDispatcher {
  public dispatch(
    notification: Notification,
    activeConversationId?: string | null,
    actions?: NotificationActions,
    browserNotificationsEnabled: boolean = false
  ): void {
    const context = notificationVisibility.getContext(
      activeConversationId, 
      browserNotificationsEnabled
    );
    const decision = notificationRules.evaluate(notification, context);

    if (decision.showToast && actions?.showToast) {
      actions.showToast(notification);
    }

    if (decision.showBrowserNotification && context.browserNotificationsEnabled) {
      const nativeNotification = browserNotification.show(notification);
      if (nativeNotification) {
        this.attachClickHandler(nativeNotification, notification, actions?.navigate);
      }
    }

    if (decision.playSound) {
      // Sound handling will be connected later
    }
  }

  private attachClickHandler(
    nativeNotification: globalThis.Notification,
    notification: Notification,
    navigate?: (path: string) => void
  ): void {
    nativeNotification.onclick = () => {
      window.focus();
      nativeNotification.close();

      if (notification.link) {
        if (navigate) {
          navigate(notification.link);
        } else {
          window.location.href = notification.link;
        }
      }
    };
  }
}

export const notificationDispatcher = new NotificationDispatcher();