// NotificationVisibility.ts

import type { NotificationContext } from "./types";
import { notificationPermission } from "./NotificationPermission";

export class NotificationVisibilityService {
  /**
   * Returns true if the tab is currently visible.
   */
  public isTabVisible(): boolean {
    return document.visibilityState === "visible";
  }

  /**
   * Returns true if the document is hidden.
   */
  public isDocumentHidden(): boolean {
    return document.hidden;
  }

  /**
   * Returns true if the browser window has focus.
   */
  public isWindowFocused(): boolean {
    return document.hasFocus();
  }

  /**
   * Builds the current notification context.
   */
  public getContext(
    activeConversationId?: string | null
  ): NotificationContext {
    return {
      permission: notificationPermission.getPermission(),
      isTabVisible: this.isTabVisible(),
      isWindowFocused: this.isWindowFocused(),
      activeConversationId,
    };
  }
}

export const notificationVisibility =
  new NotificationVisibilityService();