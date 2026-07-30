// BrowserNotificationService.ts

import type { Notification as AppNotification } from "../types/notification";
import { notificationPermission } from "./NotificationPermission";

export class BrowserNotificationService {
  /**
   * Returns whether the browser supports notifications.
   */
  public isSupported(): boolean {
    return typeof window !== "undefined" && "Notification" in window;
  }

  /**
   * Displays a browser notification.
   */
  public show(notification: AppNotification): globalThis.Notification | null {
    if (!this.isSupported()) {
      return null;
    }

    if (!notificationPermission.isGranted()) {
      return null;
    }

    const options: NotificationOptions = {
      body: notification.body,
      tag: notification.notificationId,
    };

    const browserNotification = new Notification(notification.title, options);

    browserNotification.onclick = () => {
      window.focus();
      browserNotification.close();
    };

    return browserNotification;
  }

  /**
   * Closes a notification.
   */
  public close(notification: globalThis.Notification): void {
    notification.close();
  }
}

export const browserNotification = new BrowserNotificationService();
