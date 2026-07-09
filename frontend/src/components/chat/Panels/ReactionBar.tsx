import React from 'react';
import type { Reaction } from '../../../types/chat';
import { useAuthStore } from '../../../store/useAuthStore';
import { chatService } from '../../../services/chat.service';
import { cn } from '../../ui/Button'; // fallback if available, else just use clsx from package

interface ReactionBarProps {
  messageId: string;
  reactions: Reaction[];
  onOptimisticToggle?: (reaction: string, isAdded: boolean) => void;
}

export const ReactionBar: React.FC<ReactionBarProps> = ({ messageId, reactions, onOptimisticToggle }) => {
  const currentUserId = useAuthStore((state) => state.currentUser?.id);

  if (!reactions || reactions.length === 0) return null;

  // Group reactions by reaction name
  const grouped = reactions.reduce((acc, curr) => {
    if (!acc[curr.reaction]) {
      acc[curr.reaction] = { count: 0, hasReacted: false };
    }
    acc[curr.reaction].count += 1;
    if (curr.userId === currentUserId) {
      acc[curr.reaction].hasReacted = true;
    }
    return acc;
  }, {} as Record<string, { count: number; hasReacted: boolean }>);

  const handleToggle = async (reaction: string, hasReacted: boolean) => {
    if (onOptimisticToggle) {
      onOptimisticToggle(reaction, !hasReacted);
    }
    try {
      await chatService.toggleReaction(messageId, reaction);
    } catch (error) {
      console.error('Failed to toggle reaction:', error);
      if (onOptimisticToggle) {
        onOptimisticToggle(reaction, hasReacted);
      }
    }
  };

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {Object.entries(grouped).map(([reactionName, data]) => (
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
          <span className="mr-1">{reactionName}</span>
          <span>{data.count}</span>
        </button>
      ))}
    </div>
  );
};
