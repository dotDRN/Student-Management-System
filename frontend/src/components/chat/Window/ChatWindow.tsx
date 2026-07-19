import React from 'react';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, AlertCircle } from 'lucide-react';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { Composer } from '../Composer/Composer';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../../../store/useChatStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { chatService } from '../../../services/chat.service';
import type { Message } from '../../../types/chat';

export const ChatWindow: React.FC = () => {
  const { activeConversationId } = useChatStore();
  const currentUserId = useAuthStore((state) => state.currentUser?.id);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Fetch Conversation Metadata
  const { data: conversation, isLoading: isLoadingConv, isError: isConvError } = useQuery({
    queryKey: ['conversation', activeConversationId],
    queryFn: () => chatService.getConversationById(activeConversationId!),
    enabled: !!activeConversationId,
    retry: false,
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
      // The backend returns messages in descending order (newest first).
      // To get older messages, we use the oldest message in the last page as the cursor.
      return lastPage.length === 50 ? lastPage[lastPage.length - 1].id : undefined; 
    },
    initialPageParam: undefined,
    enabled: !!activeConversationId,
  });

  const messages = [...(messagesData?.pages.flat() || [])].reverse();

  const handleOptimisticSend = (tempId: string, content: string, attachments: any[]) => {
    // Add optimistic message to cache immediately
    const tempMsg: Message = {
      id: tempId,
      clientMsgId: tempId,
      conversationId: activeConversationId!,
      senderId: currentUserId || 'unknown',
      content,
      type: 'text',
      status: 'SENDING',
      isEdited: false,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reactions: [],
      attachments: attachments.map(a => ({
        id: a.id,
        url: a.previewUrl,
        fileName: a.file.name,
        mimeType: a.file.type,
        fileSize: a.file.size,
        createdAt: new Date().toISOString()
      }))
    };

    queryClient.setQueryData(['messages', activeConversationId], (oldData: any) => {
      if (!oldData) return { pages: [[tempMsg]], pageParams: [undefined] };
      const newPages = [...oldData.pages];
      newPages[0] = [tempMsg, ...newPages[0]];
      return { ...oldData, pages: newPages };
    });
  };

  const handleOptimisticSuccess = (tempId: string, realMessage: Message) => {
    // Enrich sender
    const conversations = queryClient.getQueryData<any[]>(['conversations']);
    const activeConv = conversations?.find((c: any) => c.id === activeConversationId);
    const senderMember = activeConv?.members?.find((m: any) => m.userId === realMessage.senderId);
    const enrichedMessage: Message = {
      ...realMessage,
      sender: {
        fullName: senderMember?.user?.fullName || 'Unknown User',
        email: senderMember?.user?.email || ''
      }
    };

    queryClient.setQueryData(['messages', activeConversationId], (oldData: any) => {
      if (!oldData?.pages) return oldData;
      
      const newPages = oldData.pages.map((page: Message[]) => {
        if (page.some(m => m.id === realMessage.id)) {
          return page.filter(m => m.id !== tempId);
        }
        return page.map(m => m.id === tempId ? enrichedMessage : m);
      });
      return { ...oldData, pages: newPages };
    });
  };

  const handleOptimisticError = (tempId: string) => {
    queryClient.setQueryData(['messages', activeConversationId], (oldData: any) => {
      if (!oldData?.pages) return oldData;
      const newPages = oldData.pages.map((page: Message[]) => page.filter(m => m.id !== tempId));
      return { ...oldData, pages: newPages };
    });
  };

  const handleEditSuccess = (messageId: string, newContent: string) => {
    queryClient.setQueryData(['messages', activeConversationId], (oldData: any) => {
      if (!oldData?.pages) return oldData;
      return {
        ...oldData,
        pages: oldData.pages.map((page: Message[]) =>
          page.map(m => m.id === messageId ? { ...m, content: newContent, isEdited: true, updatedAt: new Date().toISOString() } : m)
        )
      };
    });
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      // Optimistic or immediate update
      queryClient.setQueryData(['messages', activeConversationId], (oldData: any) => {
        if (!oldData?.pages) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page: Message[]) =>
            page.map(m => m.id === messageId ? { ...m, isDeleted: true, content: '[This message was deleted]' } : m)
          )
        };
      });
      await chatService.deleteMessage(messageId);
    } catch (error) {
      console.error('Failed to delete message:', error);
      // Optional: revert cache on failure
    }
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

  if (isConvError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-neutral-50/50 hidden md:flex">
        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6 shadow-sm">
          <AlertCircle size={36} className="text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-neutral-800 mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
          Conversation Not Found
        </h2>
        <p className="text-neutral-500 text-center max-w-sm mb-6">
          The conversation you're looking for doesn't exist or you don't have access to it.
        </p>
        <button
          onClick={() => navigate('/chat')}
          className="px-5 py-2 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 transition-all shadow-sm shadow-brand-500/25"
        >
          Return to Messages
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white relative">
      {conversation && <ChatHeader conversation={conversation} />}
      
      <MessageList 
        conversationId={activeConversationId} 
        messages={messages} 
        isLoading={isLoadingMessages}
        onLoadMore={() => fetchNextPage()}
        hasNextPage={!!hasNextPage}
        onDelete={handleDeleteMessage}
      />
      
      <Composer 
        conversationId={activeConversationId} 
        onOptimisticSend={handleOptimisticSend}
        onOptimisticSuccess={handleOptimisticSuccess}
        onOptimisticError={handleOptimisticError}
        onEditSuccess={handleEditSuccess}
      />
    </div>
  );
};
