class ActiveConversationTracker {
  // Map of userId -> Map of socketId -> conversationId
  // Supports multi-tab / multi-device focus tracking while remaining backwards-compatible
  // when socketId is omitted (uses a 'default' key).
  private activeConversations: Map<string, Map<string, string>> = new Map();

  /**
   * Records that a user (optionally on a specific socket) is actively viewing a conversation.
   */
  public async focusConversation(
    userId: string,
    conversationId: string,
    socketId: string = "default",
  ): Promise<void> {
    if (!this.activeConversations.has(userId)) {
      this.activeConversations.set(userId, new Map());
    }
    this.activeConversations.get(userId)!.set(socketId, conversationId);
    console.log(`👁️ [Tracker] User ${userId} (socket ${socketId}) focused conversation ${conversationId}`);
  }

  /**
   * Records that a user (or a specific socket of that user) has stopped viewing their active conversation.
   */
  public async blurConversation(userId: string, socketId?: string): Promise<void> {
    const userSockets = this.activeConversations.get(userId);
    if (!userSockets) return;

    if (socketId) {
      const prev = userSockets.get(socketId);
      if (prev) {
        userSockets.delete(socketId);
        console.log(`🙈 [Tracker] User ${userId} (socket ${socketId}) blurred conversation ${prev}`);
      }
      if (userSockets.size === 0) {
        this.activeConversations.delete(userId);
      }
    } else {
      this.activeConversations.delete(userId);
      console.log(`🙈 [Tracker] User ${userId} blurred all conversations`);
    }
  }

  /**
   * Returns a conversationId the user is currently viewing, or undefined if none.
   */
  public async getFocusedConversation(userId: string): Promise<string | undefined> {
    const userSockets = this.activeConversations.get(userId);
    if (!userSockets || userSockets.size === 0) return undefined;
    return userSockets.values().next().value;
  }

  /**
   * Checks if the user is currently viewing a specific conversation on any active socket/tab.
   */
  public async isViewingConversation(userId: string, conversationId: string): Promise<boolean> {
    const userSockets = this.activeConversations.get(userId);
    if (!userSockets) return false;
    for (const activeConvId of userSockets.values()) {
      if (activeConvId === conversationId) {
        return true;
      }
    }
    return false;
  }
}

export const activeConversationTracker = new ActiveConversationTracker();
