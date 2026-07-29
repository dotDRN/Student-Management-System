import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { socketService } from '../services/socket.service';
import { useChatStore } from '../store/useChatStore';
import type { Message, Conversation } from '../types/chat';
import type { Notification, NotificationListResponse, UnreadCountResponse } from '../types/notification';
import { useNotificationStore } from '../store/useNotificationStore';
import { useToast } from './useToast';

export const useChatSocket = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const addTypingUser = useChatStore((state) => state.addTypingUser);
  const removeTypingUser = useChatStore((state) => state.removeTypingUser);
  const updatePresence = useChatStore((state) => state.updatePresence);
  const setSocketConnected = useChatStore((state) => state.setSocketConnected);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const isSocketConnected = useChatStore((state) => state.isSocketConnected);

  const addNotification = useNotificationStore((state) => state.addNotification);
  const incrementUnread = useNotificationStore((state) => state.incrementUnread);

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
          id: senderMember?.user?.id || message.senderId,
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

    const handleReactionUpdated = (data: { messageId: string; conversationId: string; reactions: any[] }) => {
      queryClient.setQueryData(
        ['messages', data.conversationId],
        (old: any) => {
          if (!old?.pages) return old;
          
          return {
            ...old,
            pages: old.pages.map((page: Message[]) => 
              page.map(m => m.id === data.messageId ? { ...m, reactions: data.reactions } : m)
            )
          };
        }
      );
    };

    const handleNewNotification = async (data: Omit<Notification, 'isRead' | 'readAt'>) => {
      const notification: Notification = { ...data, isRead: false };
      const existing = useNotificationStore.getState().notifications.some(
        (item) => item.notificationRecipientId === notification.notificationRecipientId,
      );

      if (existing) return;

      addNotification(notification);
      incrementUnread();
      toast.notification({
        title: notification.title,
        description: notification.body,
        action: notification.link
          ? {
              label: 'Open',
              onClick: () => {
                void navigate(notification.link!);
              },
            }
          : undefined,
      });

      // Prevent in-flight REST responses from overwriting this newer socket state.
      await queryClient.cancelQueries({ queryKey: ['notifications'] });

      queryClient.setQueriesData<NotificationListResponse>(
        {
          predicate: (query) =>
            query.queryKey[0] === 'notifications' && typeof query.queryKey[1] === 'number',
        },
        (old) => old
          ? {
              ...old,
              notifications: [notification, ...old.notifications],
              pagination: { ...old.pagination, total: old.pagination.total + 1 },
            }
          : old,
      );

      queryClient.setQueryData(['notifications', 'infinite'], (old: any) => {
        if (!old || !old.pages || old.pages.length === 0) return old;
        const newPages = [...old.pages];
        newPages[0] = {
          ...newPages[0],
          notifications: [notification, ...newPages[0].notifications],
          pagination: { ...newPages[0].pagination, total: newPages[0].pagination.total + 1 },
        };
        return { ...old, pages: newPages };
      });

      queryClient.setQueryData<UnreadCountResponse>(
        ['notifications', 'unreadCount'],
        (old) => ({ unreadCount: (old?.unreadCount ?? 0) + 1 }),
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
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unreadCount'] });
    };

    // Attach listeners
    socketService.on('message:new', handleNewMessage);
    socketService.on('message:updated', handleMessageUpdated);
    socketService.on('message:deleted', handleMessageDeleted);
    socketService.on('message:reaction_updated', handleReactionUpdated);
    socketService.on('notification:new', handleNewNotification);
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
      socketService.off('message:reaction_updated', handleReactionUpdated);
      socketService.off('notification:new', handleNewNotification);
      socketService.off('conversation:new', handleNewConversation);
      socketService.off('conversation:read_update', handleReadUpdate);
      socketService.off('typing:update', handleTypingUpdate);
      socketService.off('presence:update', handlePresenceUpdate);
      window.removeEventListener('chat:reconnected', handleReconnected);
    };
  }, [
    queryClient,
    addTypingUser,
    removeTypingUser,
    updatePresence,
    setSocketConnected,
    addNotification,
    incrementUnread,
    navigate,
    toast,
  ]);

  useEffect(() => {
    if (activeConversationId && isSocketConnected) {
      socketService.emit('conversation:focus', { conversationId: activeConversationId });
    }
    
    return () => {
      // It's safe to always try emitting blur. If disconnected, it safely drops.
      socketService.emit('conversation:blur');
    };
  }, [activeConversationId, isSocketConnected]);
};

