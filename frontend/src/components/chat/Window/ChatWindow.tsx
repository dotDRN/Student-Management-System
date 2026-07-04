import React from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { Composer } from '../Composer/Composer';
import { useChatStore } from '../../../store/useChatStore';
import { chatService } from '../../../services/chat.service';
import { Message } from '../../../types/chat';

export const ChatWindow: React.FC = () => {
  const { activeConversationId } = useChatStore();
  const queryClient = useQueryClient();

  // Fetch Conversation Metadata
  const { data: conversation, isLoading: isLoadingConv } = useQuery({
    queryKey: ['conversation', activeConversationId],
    queryFn: () => chatService.getConversationById(activeConversationId!),
    enabled: !!activeConversationId,
  });

  // Fetch Messages with infinite scroll support (cursor based)
  const { 
    data: messagesData, 
    isLoading: isLoadingMessages, 
    fetchNextPage, 
    hasNextPage 
  } = useInfiniteQuery({
    queryKey: ['messages', activeConversationId],
    queryFn: ({ pageParam }) => chatService.getMessages(activeConversationId!, pageParam as string | undefined),
    getNextPageParam: (lastPage) => {
      // Assuming lastPage is an array, and the earliest message is at index 0. We'd use its ID as cursor.
      return lastPage.length === 50 ? lastPage[0].id : undefined; 
    },
    initialPageParam: undefined,
    enabled: !!activeConversationId,
  });

  const messages = messagesData?.pages.flat() || [];

  const handleOptimisticSend = (tempId: string, content: string, attachments: any[]) => {
    // Add optimistic message to cache immediately
    const tempMsg: Message = {
      id: tempId,
      clientMsgId: tempId,
      conversationId: activeConversationId!,
      senderId: 'currentUserId', // Will be swapped on actual render by auth store logic but needed for struct
      content,
      type: 'TEXT',
      status: 'SENDING',
      isEdited: false,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reactions: [],
      attachments: attachments.map(a => ({
        id: a.id,
        fileUrl: a.previewUrl,
        fileName: a.file.name,
        fileType: a.file.type,
        fileSize: a.file.size,
        createdAt: new Date().toISOString()
      }))
    };

    queryClient.setQueryData(['messages', activeConversationId], (oldData: any) => {
      if (!oldData) return { pages: [[tempMsg]], pageParams: [undefined] };
      const newPages = [...oldData.pages];
      newPages[newPages.length - 1] = [...newPages[newPages.length - 1], tempMsg];
      return { ...oldData, pages: newPages };
    });
  };

  if (!activeConversationId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-neutral-50/50 hidden md:flex">
        <div className="w-20 h-20 bg-brand-50 rounded-full flex items-center justify-center mb-6 shadow-sm">
          <MessageSquare size={36} className="text-brand-500" />
        </div>
        <h2 className="text-2xl font-bold text-neutral-800 mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
          Your Messages
        </h2>
        <p className="text-neutral-500 text-center max-w-sm">
          Select a conversation from the sidebar to start chatting, or create a new one.
        </p>
      </div>
    );
  }

  if (isLoadingConv) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white relative">
      {conversation && <ChatHeader conversation={conversation} />}
      
      <MessageList 
        conversationId={activeConversationId} 
        messages={messages} 
        isLoading={isLoadingMessages}
        onLoadMore={() => fetchNextPage()}
        hasNextPage={!!hasNextPage}
      />
      
      <Composer 
        conversationId={activeConversationId} 
        onOptimisticSend={handleOptimisticSend} 
      />
    </div>
  );
};
