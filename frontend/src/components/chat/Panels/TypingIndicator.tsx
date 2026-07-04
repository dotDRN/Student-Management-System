import React from 'react';
import { useChatStore } from '../../../store/useChatStore';

interface TypingIndicatorProps {
  conversationId: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ conversationId }) => {
  const typingUsers = useChatStore((state) => state.typingUsers[conversationId] || []);

  if (typingUsers.length === 0) return null;

  let typingText = '';
  if (typingUsers.length === 1) {
    typingText = `${typingUsers[0].userName} is typing...`;
  } else if (typingUsers.length === 2) {
    typingText = `${typingUsers[0].userName} and ${typingUsers[1].userName} are typing...`;
  } else {
    typingText = `${typingUsers[0].userName}, ${typingUsers[1].userName} and ${typingUsers.length - 2} others are typing...`;
  }

  return (
    <div className="px-4 py-2 flex items-center text-xs font-medium text-neutral-500 bg-transparent">
      <div className="flex space-x-1 mr-2">
        <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
        <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
        <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
      </div>
      <span>{typingText}</span>
    </div>
  );
};
