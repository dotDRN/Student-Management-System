import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketService } from '../services/socket.service';
import { useChatStore } from '../store/useChatStore';
import type { Message, Conversation } from '../types/chat';

export const useChatSocket = () => {
  const queryClient = useQueryClient();
  const { 
    addTypingUser, 
    removeTypingUser, 
    updatePresence,
    setSocketConnected
  } = useChatStore();

  useEffect(() => {
    const handleConnect = (isConnected: boolean) => {
      setSocketConnected(isConnected);
    };

    const unsubscribe = socketService.subscribeToConnectionState(handleConnect);

    // Message Events
    const handleNewMessage = (data: { message: Message }) => {
      const { message } = data;
      
      // Enrich sender information locally since backend message:new payload omits it
      const conversations = queryClient.getQueryData<Conversation[]>(['conversations']);
      const activeConv = conversations?.find(c => c.id === message.conversationId);
      const senderMember = activeConv?.members?.find(m => m.userId === message.senderId);
      const enrichedMessage: Message = {
        ...message,
        sender: {
          fullName: senderMember?.user?.fullName || 'Unknown User',
          email: senderMember?.user?.email || ''
        }
      };

      queryClient.setQueryData(
        ['messages', message.conversationId],
        (old: any) => {
          if (!old?.pages) return old;
          
          const newPages = [...old.pages];
          
          if (newPages.length > 0) {
            // Prevent duplicates
            const exists = newPages.some(page => page.find((m: Message) => m.id === message.id || m.clientMsgId === message.id));
            if (!exists) {
              newPages[0] = [enrichedMessage, ...newPages[0]];
            }
          }
          
          return {
            ...old,
            pages: newPages,
          };
        }
      );
    };

    const handleMessageUpdated = (data: { id: string; conversationId: string; content: string; updatedAt: string }) => {
      queryClient.setQueryData(
        ['messages', data.conversationId],
        (old: any) => {
          if (!old?.pages) return old;
          
          return {
            ...old,
            pages: old.pages.map((page: Message[]) => 
              page.map(m => m.id === data.id ? { ...m, content: data.content, updatedAt: data.updatedAt } : m)
            )
          };
        }
      );
    };

    const handleMessageDeleted = (data: { id: string; conversationId: string }) => {
      queryClient.setQueryData(
        ['messages', data.conversationId],
        (old: any) => {
          if (!old?.pages) return old;
          
          return {
            ...old,
            pages: old.pages.map((page: Message[]) => 
              page.map(m => m.id === data.id ? { ...m, isDeleted: true, content: '[This message was deleted]' } : m)
            )
          };
        }
      );
    };

    // Conversation Events
    const handleNewConversation = (data: { conversation: Conversation }) => {
      queryClient.setQueryData<Conversation[]>(
        ['conversations'],
        (old = []) => {
          if (old.find(c => c.id === data.conversation.id)) return old;
          return [data.conversation, ...old];
        }
      );
      // Ensure we join the room for this new conversation on the client side if necessary,
      // though the backend should handle joining the room on the socket directly or we just emit an event to server
      socketService.emit('conversation:join', { conversationId: data.conversation.id });
    };

    const handleReadUpdate = (data: { conversationId: string; userId: string; lastReadAt: string }) => {
      queryClient.setQueryData<Conversation[]>(
        ['conversations'],
        (old = []) => old.map(c => {
          if (c.id === data.conversationId) {
            // Update the specific participant's lastReadAt
            const updatedMembers = c.members?.map(m => 
              m.userId === data.userId ? { ...m, lastReadAt: data.lastReadAt } : m
            ) || c.members;
            return { ...c, members: updatedMembers };
          }
          return c;
        })
      );
    };

    // Ephemeral Events
    const handleTypingUpdate = (data: { conversationId: string; userId: string; fullName: string; isTyping: boolean }) => {
      if (data.isTyping) {
        addTypingUser(data.conversationId, { userId: data.userId, userName: data.fullName });
      } else {
        removeTypingUser(data.conversationId, data.userId);
      }
    };

    const handlePresenceUpdate = (data: { userId: string; status: 'online' | 'offline' }) => {
      updatePresence(data.userId, data.status);
    };

    // Reconnection healing
    const handleReconnected = () => {
      // Invalidate queries to refetch data missed during downtime
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    // Attach listeners
    socketService.on('message:new', handleNewMessage);
    socketService.on('message:updated', handleMessageUpdated);
    socketService.on('message:deleted', handleMessageDeleted);
    socketService.on('conversation:new', handleNewConversation);
    socketService.on('conversation:read_update', handleReadUpdate);
    socketService.on('typing:update', handleTypingUpdate);
    socketService.on('presence:update', handlePresenceUpdate);
    window.addEventListener('chat:reconnected', handleReconnected);

    // Cleanup
    return () => {
      unsubscribe();
      socketService.off('message:new', handleNewMessage);
      socketService.off('message:updated', handleMessageUpdated);
      socketService.off('message:deleted', handleMessageDeleted);
      socketService.off('conversation:new', handleNewConversation);
      socketService.off('conversation:read_update', handleReadUpdate);
      socketService.off('typing:update', handleTypingUpdate);
      socketService.off('presence:update', handlePresenceUpdate);
      window.removeEventListener('chat:reconnected', handleReconnected);
    };
  }, [queryClient, addTypingUser, removeTypingUser, updatePresence, setSocketConnected]);
};
