import React from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { Check, CheckCheck, Users } from 'lucide-react';
import type { Conversation, Message } from '../../../types/chat';
import { useAuthStore } from '../../../store/useAuthStore';
import { useChatStore } from '../../../store/useChatStore';
import { cn } from '../../ui/Button';
import {
  getConversationDisplayName,
  getConversationInitials,
  getConversationAvatar,
  getOtherParticipant,
} from '../../../utils/chatHelpers';

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
}

function getLastMessagePreview(lastMsg: Message): string {
  if (lastMsg.isDeleted) return '[This message was deleted]';
  if (lastMsg.content && lastMsg.content.trim()) {
    if (lastMsg.type === 'image') return `📷 ${lastMsg.content}`;
    if (lastMsg.type === 'audio') return `🎵 ${lastMsg.content}`;
    if (lastMsg.type === 'file') return `📎 ${lastMsg.content}`;
    return lastMsg.content;
  }
  const firstAttName = lastMsg.attachments?.[0]?.fileName;
  if (lastMsg.type === 'image') return firstAttName ? `📷 ${firstAttName}` : '📷 Photo';
  if (lastMsg.type === 'audio') return firstAttName ? `🎵 ${firstAttName}` : '🎵 Audio';
  if (lastMsg.type === 'file' || (lastMsg.attachments && lastMsg.attachments.length > 0)) {
    return firstAttName ? `📎 ${firstAttName}` : '📎 Attachment';
  }
  return 'Sent a message';
}

export const ConversationItem: React.FC<ConversationItemProps> = React.memo(
  ({ conversation, isActive, onClick }) => {
    const currentUserId = useAuthStore((state) => state.currentUser?.id);
    const presenceMap = useChatStore((state) => state.presenceMap);

    const getChatName = () => getConversationDisplayName(conversation, currentUserId);

    const formatTime = (dateString: string) => {
      const date = new Date(dateString);
      if (isToday(date)) return format(date, 'HH:mm');
      if (isYesterday(date)) return 'Yesterday';
      return format(date, 'dd/MM/yyyy');
    };

    const lastMsg = conversation.messages?.[0];
    const isSender = lastMsg?.senderId === currentUserId;

    const myMember = conversation.members?.find((m) => m.userId === currentUserId);
    const otherMembers =
      conversation.members?.filter((m) => m.userId !== currentUserId) || [];
    const otherParticipant = getOtherParticipant(conversation, currentUserId);
    const isOtherOnline = otherParticipant
      ? presenceMap[otherParticipant.userId] === 'online'
      : false;

    const hasUnread = Boolean(
      !isActive &&
        lastMsg &&
        lastMsg.senderId !== currentUserId &&
        (!myMember?.lastReadAt ||
          new Date(lastMsg.createdAt).getTime() > new Date(myMember.lastReadAt).getTime()),
    );

    const isLastMsgReadByOthers = Boolean(
      isSender &&
        lastMsg &&
        otherMembers.length > 0 &&
        otherMembers.some(
          (m) =>
            m.lastReadAt &&
            new Date(m.lastReadAt).getTime() >= new Date(lastMsg.createdAt).getTime(),
        ),
    );

    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full flex items-center gap-3 p-3 transition-colors text-left border-b border-neutral-100 last:border-b-0',
          isActive ? 'bg-brand-50' : 'hover:bg-neutral-50 bg-white',
        )}
      >
        <div className="relative shrink-0">
          {getConversationAvatar(conversation, currentUserId) ? (
            <img
              src={getConversationAvatar(conversation, currentUserId)}
              alt="Avatar"
              className="w-12 h-12 rounded-full object-cover shadow-sm"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-lg shadow-sm">
              {conversation.type === 'group' ? (
                <Users size={20} />
              ) : (
                getConversationInitials(conversation, currentUserId)
              )}
            </div>
          )}
          {conversation.type === 'direct' && isOtherOnline && (
            <span
              className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white"
              title="Online"
            />
          )}
          {hasUnread && (
            <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-brand-500 rounded-full border-2 border-white" />
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-center h-12">
          <div className="flex justify-between items-baseline mb-0.5">
            <h3
              className={cn(
                'text-sm truncate pr-2',
                hasUnread
                  ? 'font-bold text-neutral-900'
                  : 'font-semibold text-neutral-800',
              )}
            >
              {getChatName()}
            </h3>
            {lastMsg && (
              <span
                className={cn(
                  'text-[10px] whitespace-nowrap shrink-0',
                  isActive || hasUnread
                    ? 'text-brand-600 font-medium'
                    : 'text-neutral-400',
                )}
              >
                {formatTime(lastMsg.createdAt)}
              </span>
            )}
          </div>

          <div className="flex items-center text-xs text-neutral-500 min-w-0">
            {isSender && lastMsg && (
              <span className="mr-1 shrink-0">
                {lastMsg.status === 'read' || isLastMsgReadByOthers ? (
                  <CheckCheck size={14} className="text-brand-500" />
                ) : (
                  <Check size={14} />
                )}
              </span>
            )}
            <span
              className={cn(
                'truncate',
                hasUnread
                  ? 'font-medium text-neutral-900'
                  : !isActive && 'text-neutral-500',
              )}
            >
              {lastMsg ? (
                getLastMessagePreview(lastMsg)
              ) : (
                <span className="italic">No messages yet</span>
              )}
            </span>
          </div>
        </div>
      </button>
    );
  },
);
