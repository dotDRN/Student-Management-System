import React from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { Check, CheckCheck, Users } from 'lucide-react';
import { Conversation } from '../../../types/chat';
import { useAuthStore } from '../../../store/useAuthStore';
import { cn } from '../../ui/Button';

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
}

export const ConversationItem: React.FC<ConversationItemProps> = React.memo(({ conversation, isActive, onClick }) => {
  const currentUserId = useAuthStore((state) => state.currentUser?.id);

  const getChatName = () => {
    if (conversation.type === 'GROUP') return conversation.name || 'Group Chat';
    // Ideally map the other member's name
    const otherMember = conversation.members?.find(m => m.userId !== currentUserId);
    return otherMember?.user?.profile ? `${otherMember.user.profile.firstName} ${otherMember.user.profile.lastName}` : 'Direct Message';
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return format(date, 'HH:mm');
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'dd/MM/yyyy');
  };

  const lastMsg = conversation.lastMessage;
  const isSender = lastMsg?.senderId === currentUserId;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3 transition-colors text-left border-b border-neutral-100 last:border-b-0",
        isActive ? "bg-brand-50" : "hover:bg-neutral-50 bg-white"
      )}
    >
      <div className="relative shrink-0">
        {conversation.avatarUrl ? (
          <img src={conversation.avatarUrl} alt="Avatar" className="w-12 h-12 rounded-full object-cover shadow-sm" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-lg shadow-sm">
            {conversation.type === 'GROUP' ? <Users size={20} /> : getChatName().charAt(0).toUpperCase()}
          </div>
        )}
        {/* Unread badge placeholder */}
        {false && (
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-brand-500 rounded-full border-2 border-white flex items-center justify-center text-[10px] text-white font-bold">
            3
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center h-12">
        <div className="flex justify-between items-baseline mb-0.5">
          <h3 className="font-semibold text-neutral-800 text-sm truncate pr-2">
            {getChatName()}
          </h3>
          {lastMsg && (
            <span className={cn("text-[10px] whitespace-nowrap shrink-0", isActive ? "text-brand-600 font-medium" : "text-neutral-400")}>
              {formatTime(lastMsg.createdAt)}
            </span>
          )}
        </div>
        
        <div className="flex items-center text-xs text-neutral-500">
          {isSender && lastMsg && (
            <span className="mr-1 shrink-0">
              {lastMsg.status === 'READ' ? (
                <CheckCheck size={14} className="text-brand-500" />
              ) : (
                <Check size={14} />
              )}
            </span>
          )}
          <span className={cn("truncate", !isActive && "text-neutral-500")}>
            {lastMsg ? (
              lastMsg.type === 'FILE' ? '📎 Attachment' : lastMsg.content
            ) : (
              <span className="italic">No messages yet</span>
            )}
          </span>
        </div>
      </div>
    </button>
  );
});
