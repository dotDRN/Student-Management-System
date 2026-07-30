// NotificationDispatcher.ts

import type { NotificationPayload } from "./types";

export class NotificationDispatcher {
  public async dispatch(notification: NotificationPayload): Promise<void> {
    // Implementation will be added step by step.
  }
}

export const notificationDispatcher = new NotificationDispatcher();