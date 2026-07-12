import React from 'react';
import type { Reaction, Message } from '../../../types/chat';
import { useAuthStore } from '../../../store/useAuthStore';
import { useChatStore } from '../../../store/useChatStore';
import { chatService } from '../../../services/chat.service';
import { cn } from '../../ui/Button'; 
import { useQueryClient } from '@tanstack/react-query';

interface ReactionBarProps {
  messageId: string;
  reactions: Reaction[];
}

const EMOJI_MAP: Record<string, string> = {
  like: '👍',
  love: '❤️',
  laugh: '😂',
  wow: '😮',
};

export const ReactionBar: React.FC<ReactionBarProps> = ({ messageId, reactions }) => {
  const currentUserId = useAuthStore((state) => state.currentUser?.id);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const queryClient = useQueryClient();

  if (!reactions || reactions.length === 0) return null;

  // Group reactions by reaction name
  const grouped = reactions.reduce((acc, curr) => {
    if (!acc[curr.reaction]) {
      acc[curr.reaction] = { count: 0, hasReacted: false, userReactionId: null };
    }
    acc[curr.reaction].count += 1;
    if (curr.userId === currentUserId) {
      acc[curr.reaction].hasReacted = true;
      acc[curr.reaction].userReactionId = curr.id;
    }
    return acc;
  }, {} as Record<string, { count: number; hasReacted: boolean; userReactionId: string | null }>);

  const handleToggle = async (reactionType: string, hasReacted: boolean) => {
    if (!activeConversationId || !currentUserId) return;

    const previousMessages = queryClient.getQueryData(['messages', activeConversationId]);

    // Optimistic Update
    queryClient.setQueryData(['messages', activeConversationId], (old: any) => {
      if (!old?.pages) return old;
      return {
        ...old,
        pages: old.pages.map((page: Message[]) =>
          page.map((m) => {
            if (m.id === messageId) {
              const newReactions = hasReacted
                ? m.reactions.filter((r) => !(r.userId === currentUserId && r.reaction === reactionType))
                : [
                    ...m.reactions,
                    {
                      id: `temp-${Date.now()}`,
                      messageId,
                      userId: currentUserId,
                      reaction: reactionType as any,
                      createdAt: new Date().toISOString(),
                    },
                  ];
              return { ...m, reactions: newReactions };
            }
            return m;
          })
        ),
      };
    });

    try {
      if (hasReacted) {
        await chatService.removeReaction(messageId);
      } else {
        await chatService.addReaction(messageId, reactionType);
      }
    } catch (error) {
      console.error('Failed to toggle reaction:', error);
      // Rollback
      queryClient.setQueryData(['messages', activeConversationId], previousMessages);
    }
  };

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {Object.entries(grouped).map(([reactionName, data]) => {
        const emoji = EMOJI_MAP[reactionName];
        if (!emoji) return null; // Only render supported reactions

        return (
          <button
            key={reactionName}
            onClick={() => handleToggle(reactionName, data.hasReacted)}
            className={cn(
              "flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
              data.hasReacted 
                ? "bg-brand-50 border-brand-200 text-brand-700" 
                : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"
            )}
          >
            <span className="mr-1">{emoji}</span>
            <span>{data.count}</span>
          </button>
        );
      })}
    </div>
  );
};
