import type { Conversation, ConversationMember } from '../types/chat';

export const getOtherParticipant = (
  conversation: Conversation,
  currentUserId?: string
): ConversationMember | undefined => {
  if (conversation.type !== 'direct') return undefined;
  return conversation.members?.find((m) => m.userId !== currentUserId);
};

export const getConversationDisplayName = (
  conversation: Conversation,
  currentUserId?: string
): string => {
  if (conversation.title) {
    return conversation.title;
  }

  if (conversation.type === 'direct') {
    const otherMember = getOtherParticipant(conversation, currentUserId);
    if (otherMember?.user) {
      return otherMember.user.fullName;
    }
    return 'Direct Message';
  }

  // Fallback for unnamed groups: join up to 3 members' full names
  const membersWithNames = (conversation.members || [])
    .filter(m => m.user?.fullName)
    .map(m => m.user!.fullName);
  
  if (membersWithNames.length === 0) {
    return 'Group Conversation';
  }

  const limit = 3;
  const joined = membersWithNames.slice(0, limit).join(', ');
  if (membersWithNames.length > limit) {
    return `${joined}, and ${membersWithNames.length - limit} others`;
  }
  return joined;
};

export const getConversationAvatar = (
  conversation: Conversation,
  currentUserId?: string
): string | undefined => {
  if (conversation.avatarUrl) {
    return conversation.avatarUrl;
  }
  // No fallback logic for DM avatar yet (could return other member's avatar if users had avatars)
  return undefined;
};

export const getConversationInitials = (
  conversation: Conversation,
  currentUserId?: string
): string => {
  const name = getConversationDisplayName(conversation, currentUserId);
  return name.charAt(0).toUpperCase();
};
