class ActiveConversationTracker {
  // Map of userId -> conversationId
  // Uses an in-memory Map for now, designed to be easily swappable with Redis
  private activeConversations: Map<string, string> = new Map();

  /**
   * Records that a user is actively viewing a specific conversation.
   */
  public async focusConversation(userId: string, conversationId: string): Promise<void> {
    this.activeConversations.set(userId, conversationId);
    console.log(`👁️ [Tracker] User ${userId} focused conversation ${conversationId}`);
  }

  /**
   * Records that a user has stopped viewing their active conversation.
   */
  public async blurConversation(userId: string): Promise<void> {
    const prev = this.activeConversations.get(userId);
    if (prev) {
      this.activeConversations.delete(userId);
      console.log(`🙈 [Tracker] User ${userId} blurred conversation ${prev}`);
    }
  }

  /**
   * Returns the conversationId the user is currently viewing, or undefined if none.
   */
  public async getFocusedConversation(userId: string): Promise<string | undefined> {
    return this.activeConversations.get(userId);
  }

  /**
   * Checks if the user is currently viewing a specific conversation.
   */
  public async isViewingConversation(userId: string, conversationId: string): Promise<boolean> {
    return this.activeConversations.get(userId) === conversationId;
  }
}

export const activeConversationTracker = new ActiveConversationTracker();
