// NotificationPermission.ts

export class NotificationPermissionService {
  /**
   * Returns whether the Notification API is supported.
   */
  public isSupported(): boolean {
    return typeof window !== "undefined" && "Notification" in window;
  }

  /**
   * Returns the current browser notification permission.
   */
  public getPermission(): NotificationPermission {
    if (!this.isSupported()) {
      return "denied";
    }

    return Notification.permission;
  }

  /**
   * Returns true if browser notifications are allowed.
   */
  public isGranted(): boolean {
    return this.getPermission() === "granted";
  }

  /**
   * Returns true if the user has explicitly denied permission.
   */
  public isDenied(): boolean {
    return this.getPermission() === "denied";
  }

  /**
   * Returns true if the user hasn't made a choice yet.
   */
  public isDefault(): boolean {
    return this.getPermission() === "default";
  }

  /**
   * Requests browser notification permission.
   */
  public async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) {
      return "denied";
    }

    return await Notification.requestPermission();
  }
}

export const notificationPermission = new NotificationPermissionService();