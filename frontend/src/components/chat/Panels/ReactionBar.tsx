import React from 'react';
import type { Reaction } from '../../../types/chat';
import { useAuthStore } from '../../../store/useAuthStore';
import { chatService } from '../../../services/chat.service';
import { cn } from '../../ui/Button'; // fallback if available, else just use clsx from package

interface ReactionBarProps {
  messageId: string;
  reactions: Reaction[];
  onOptimisticToggle?: (emoji: string, isAdded: boolean) => void;
}

export const ReactionBar: React.FC<ReactionBarProps> = ({ messageId, reactions, onOptimisticToggle }) => {
  const currentUserId = useAuthStore((state) => state.currentUser?.id);

  if (!reactions || reactions.length === 0) return null;

  // Group reactions by emoji
  const grouped = reactions.reduce((acc, curr) => {
    if (!acc[curr.emoji]) {
      acc[curr.emoji] = { count: 0, hasReacted: false };
    }
    acc[curr.emoji].count += 1;
    if (curr.userId === currentUserId) {
      acc[curr.emoji].hasReacted = true;
    }
    return acc;
  }, {} as Record<string, { count: number; hasReacted: boolean }>);

  const handleToggle = async (emoji: string, hasReacted: boolean) => {
    if (onOptimisticToggle) {
      onOptimisticToggle(emoji, !hasReacted);
    }
    try {
      await chatService.toggleReaction(messageId, emoji);
    } catch (error) {
      console.error('Failed to toggle reaction:', error);
      if (onOptimisticToggle) {
        onOptimisticToggle(emoji, hasReacted);
      }
    }
  };

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {Object.entries(grouped).map(([emoji, data]) => (
        <button
          key={emoji}
          onClick={() => handleToggle(emoji, data.hasReacted)}
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
      ))}
    </div>
  );
};
