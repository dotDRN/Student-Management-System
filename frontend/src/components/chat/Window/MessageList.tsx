import React, { useRef, useState, useLayoutEffect } from 'react';
import { ArrowDown } from 'lucide-react';
import type { Message } from '../../../types/chat';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from '../Panels/TypingIndicator';
import { useChatStore } from '../../../store/useChatStore';

interface MessageListProps {
  conversationId: string;
  messages: Message[];
  isLoading: boolean;
  onLoadMore: () => void;
  hasNextPage: boolean;
  onDelete: (messageId: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({ 
  conversationId, messages, isLoading, onLoadMore, hasNextPage, onDelete
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const { setReplyingToMessage, setEditingMessage } = useChatStore();
  
  // To retain scroll position when loading older messages
  const previousScrollHeightRef = useRef<number>(0);
  const isFetchingRef = useRef<boolean>(false);

  // Auto-scroll to bottom on first load or when a new message is added by local user
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    
    // If not fetching older messages, scroll to bottom
    if (!isFetchingRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    } else {
      // Maintain scroll position if fetching older
      const scrollDiff = containerRef.current.scrollHeight - previousScrollHeightRef.current;
      containerRef.current.scrollTop += scrollDiff;
      isFetchingRef.current = false;
    }
  }, [messages.length]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    
    // Check if we need to load more
    if (target.scrollTop === 0 && hasNextPage && !isLoading) {
      isFetchingRef.current = true;
      previousScrollHeightRef.current = target.scrollHeight;
      onLoadMore();
    }

    // Show floating button if scrolled up
    const isScrolledUp = target.scrollHeight - target.scrollTop - target.clientHeight > 100;
    setShowScrollBottom(isScrolledUp);
  };

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth'
      });
      setShowScrollBottom(false);
    }
  };

  if (isLoading && messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-neutral-50/50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative overflow-hidden min-h-0 bg-[#F8F9FA]">
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 py-6 scroll-smooth"
      >
        {isLoading && hasNextPage && (
          <div className="flex justify-center py-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand-500"></div>
          </div>
        )}
        
        {messages.map((msg) => (
          <MessageBubble
            key={msg.clientMsgId || msg.id}
            message={msg}
            onReply={setReplyingToMessage}
            onEdit={setEditingMessage}
            onDelete={() => onDelete(msg.id)}
            onReact={(id) => console.log('React logic via useMutation', id)}
          />
        ))}

        <TypingIndicator conversationId={conversationId} />
      </div>

      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-6 bg-white border border-neutral-200 shadow-md rounded-full px-4 py-2 flex items-center gap-2 text-sm font-medium text-brand-600 hover:bg-neutral-50 transition-all z-10 animate-fade-in-up"
        >
          <ArrowDown size={16} />
          New Messages
        </button>
      )}
    </div>
  );
};
