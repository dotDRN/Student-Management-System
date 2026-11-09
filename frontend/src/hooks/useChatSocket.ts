import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { socketService } from "../services/socket.service";
import { chatService } from "../services/chat.service";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import type { Message, Conversation } from "../types/chat";
import type {
  Notification,
  NotificationListResponse,
  UnreadCountResponse,
} from "../types/notification";
import { useNotificationStore } from "../store/useNotificationStore";
import { useToast } from "./useToast";
import { notificationDispatcher } from "../notifications/NotificationDispatcher";

export const useChatSocket = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const addTypingUser = useChatStore((state) => state.addTypingUser);
  const removeTypingUser = useChatStore((state) => state.removeTypingUser);
  const updatePresence = useChatStore((state) => state.updatePresence);
  const setSocketConnected = useChatStore((state) => state.setSocketConnected);
  const activeConversationId = useChatStore(
    (state) => state.activeConversationId,
  );
  const isSocketConnected = useChatStore((state) => state.isSocketConnected);

  const addNotification = useNotificationStore(
    (state) => state.addNotification,
  );
  const incrementUnread = useNotificationStore(
    (state) => state.incrementUnread,
  );

  useEffect(() => {
    const handleConnect = (isConnected: boolean) => {
      setSocketConnected(isConnected);
    };

    const unsubscribe = socketService.subscribeToConnectionState(handleConnect);

    // Message Events
    const handleNewMessage = (data: { message: Message }) => {
      const { message } = data;
      const currentUserId = useAuthStore.getState().currentUser?.id;
      const currentActiveConvId = useChatStore.getState().activeConversationId;

      // Enrich sender information locally if needed
      const conversations = queryClient.getQueryData<Conversation[]>([
        "conversations",
      ]);
      const activeConv = conversations?.find(
        (c) => c.id === message.conversationId,
      );
      const senderMember = activeConv?.members?.find(
        (m) => m.userId === message.senderId,
      );
      const enrichedMessage: Message = {
        ...message,
        sender: message.sender?.fullName
          ? message.sender
          : {
              id: senderMember?.user?.id || message.senderId,
              fullName: senderMember?.user?.fullName || "Unknown User",
              email: senderMember?.user?.email || "",
            },
      };

      // 1. Update messages infinite query cache
      queryClient.setQueryData(
        ["messages", message.conversationId],
        (old: any) => {
          if (!old?.pages) return old;

          const newPages = [...old.pages];

          if (newPages.length > 0) {
            const exists = newPages.some((page) =>
              page.find(
                (m: Message) =>
                  m.id === message.id || m.clientMsgId === message.id,
              ),
            );
            if (!exists) {
              newPages[0] = [enrichedMessage, ...newPages[0]];
            }
          }

          return {
            ...old,
            pages: newPages,
          };
        },
      );

      // 2. Update conversations sidebar list (preview + sort by updatedAt)
      queryClient.setQueryData<Conversation[]>(
        ["conversations"],
        (old = []) => {
          const exists = old.some((c) => c.id === message.conversationId);
          if (!exists) return old;

          const updated = old.map((c) => {
            if (c.id !== message.conversationId) return c;
            return {
              ...c,
              updatedAt: enrichedMessage.createdAt,
              messages: [enrichedMessage],
            };
          });

          return updated.sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          );
        },
      );

      // 3. If user is currently viewing this conversation and message is from another user, mark conversation as read
      if (
        currentActiveConvId === message.conversationId &&
        message.senderId !== currentUserId
      ) {
        void chatService.markAsRead(message.conversationId).catch(() => {});
      }
    };

    const handleMessageUpdated = (data: {
      id: string;
      conversationId: string;
      content: string;
      updatedAt: string;
    }) => {
      queryClient.setQueryData(
        ["messages", data.conversationId],
        (old: any) => {
          if (!old?.pages) return old;

          return {
            ...old,
            pages: old.pages.map((page: Message[]) =>
              page.map((m) =>
                m.id === data.id
                  ? {
                      ...m,
                      content: data.content,
                      isEdited: true,
                      updatedAt: data.updatedAt,
                    }
                  : m,
              ),
            ),
          };
        },
      );

      queryClient.setQueryData<Conversation[]>(
        ["conversations"],
        (old = []) =>
          old.map((c) => {
            if (c.id === data.conversationId && c.messages?.[0]?.id === data.id) {
              return {
                ...c,
                messages: [
                  {
                    ...c.messages[0],
                    content: data.content,
                    isEdited: true,
                    updatedAt: data.updatedAt,
                  },
                ],
              };
            }
            return c;
          }),
      );
    };

    const handleMessageDeleted = (data: {
      id: string;
      conversationId: string;
    }) => {
      queryClient.setQueryData(
        ["messages", data.conversationId],
        (old: any) => {
          if (!old?.pages) return old;

          return {
            ...old,
            pages: old.pages.map((page: Message[]) =>
              page.map((m) =>
                m.id === data.id
                  ? {
                      ...m,
                      isDeleted: true,
                      content: "[This message was deleted]",
                    }
                  : m,
              ),
            ),
          };
        },
      );

      queryClient.setQueryData<Conversation[]>(
        ["conversations"],
        (old = []) =>
          old.map((c) => {
            if (c.id === data.conversationId && c.messages?.[0]?.id === data.id) {
              return {
                ...c,
                messages: [
                  {
                    ...c.messages[0],
                    isDeleted: true,
                    content: "[This message was deleted]",
                  },
                ],
              };
            }
            return c;
          }),
      );
    };

    const handleReactionUpdated = (data: {
      messageId: string;
      conversationId: string;
      reactions: any[];
    }) => {
      queryClient.setQueryData(
        ["messages", data.conversationId],
        (old: any) => {
          if (!old?.pages) return old;

          return {
            ...old,
            pages: old.pages.map((page: Message[]) =>
              page.map((m) =>
                m.id === data.messageId
                  ? { ...m, reactions: data.reactions }
                  : m,
              ),
            ),
          };
        },
      );
    };

    const handleNewNotification = async (
      data: Omit<Notification, "isRead" | "readAt">,
    ) => {
      const notification: Notification = { ...data, isRead: false };
      const existing = useNotificationStore
        .getState()
        .notifications.some(
          (item) =>
            item.notificationRecipientId ===
            notification.notificationRecipientId,
        );

      if (existing) return;

      const currentActiveConversationId = useChatStore.getState().activeConversationId;
      const browserNotificationsEnabled = useNotificationStore.getState().browserNotificationsEnabled;

      notificationDispatcher.dispatch(
        notification, 
        currentActiveConversationId, 
        {
          showToast: (n) => {
            toast.notification({
              title: n.title,
              description: n.body,
              action: n.link
                ? {
                    label: "Open",
                    onClick: () => {
                      void navigate(n.link!);
                    },
                  }
                : undefined,
            });
          },
          navigate: (path) => {
            void navigate(path);
          },
        },
        browserNotificationsEnabled
      );

      addNotification(notification);
      incrementUnread();

      // Prevent in-flight REST responses from overwriting this newer socket state.
      await queryClient.cancelQueries({ queryKey: ["notifications"] });

      queryClient.setQueriesData<NotificationListResponse>(
        {
          predicate: (query) =>
            query.queryKey[0] === "notifications" &&
            typeof query.queryKey[1] === "number",
        },
        (old) =>
          old
            ? {
                ...old,
                notifications: [notification, ...old.notifications],
                pagination: {
                  ...old.pagination,
                  total: old.pagination.total + 1,
                },
              }
            : old,
      );

      queryClient.setQueryData(["notifications", "infinite"], (old: any) => {
        if (!old || !old.pages || old.pages.length === 0) return old;
        const newPages = [...old.pages];
        newPages[0] = {
          ...newPages[0],
          notifications: [notification, ...newPages[0].notifications],
          pagination: {
            ...newPages[0].pagination,
            total: newPages[0].pagination.total + 1,
          },
        };
        return { ...old, pages: newPages };
      });

      queryClient.setQueryData<UnreadCountResponse>(
        ["notifications", "unreadCount"],
        (old) => ({ unreadCount: (old?.unreadCount ?? 0) + 1 }),
      );
    };

    const handleNotificationRead = (data: { notificationRecipientId: string }) => {
      useNotificationStore.getState().markAsRead(data.notificationRecipientId);

      queryClient.setQueriesData<NotificationListResponse>(
        {
          predicate: (query) =>
            query.queryKey[0] === "notifications" &&
            typeof query.queryKey[1] === "number",
        },
        (old) =>
          old
            ? {
                ...old,
                notifications: old.notifications.map((item) =>
                  item.notificationRecipientId === data.notificationRecipientId
                    ? { ...item, isRead: true, readAt: new Date().toISOString() }
                    : item,
                ),
              }
            : old,
      );

      queryClient.setQueryData(["notifications", "infinite"], (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            notifications: page.notifications.map((item: Notification) =>
              item.notificationRecipientId === data.notificationRecipientId
                ? { ...item, isRead: true, readAt: new Date().toISOString() }
                : item,
            ),
          })),
        };
      });

      queryClient.invalidateQueries({ queryKey: ["notifications", "unreadCount"] });
    };

    const handleNotificationReadAll = () => {
      useNotificationStore.getState().markAllAsRead();

      queryClient.setQueriesData<NotificationListResponse>(
        {
          predicate: (query) =>
            query.queryKey[0] === "notifications" &&
            typeof query.queryKey[1] === "number",
        },
        (old) =>
          old
            ? {
                ...old,
                notifications: old.notifications.map((item) => ({
                  ...item,
                  isRead: true,
                })),
              }
            : old,
      );

      queryClient.setQueryData(["notifications", "infinite"], (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            notifications: page.notifications.map((item: Notification) => ({
              ...item,
              isRead: true,
            })),
          })),
        };
      });

      queryClient.setQueryData<UnreadCountResponse>(
        ["notifications", "unreadCount"],
        { unreadCount: 0 },
      );
    };

    const handleNotificationConversationRead = (data: {
      conversationId: string;
      notificationRecipientIds: string[];
      unreadCount: number;
    }) => {
      const idSet = new Set(data.notificationRecipientIds);
      for (const id of idSet) {
        useNotificationStore.getState().markAsRead(id);
      }
      useNotificationStore.getState().setUnreadCount(data.unreadCount);

      queryClient.setQueriesData<NotificationListResponse>(
        {
          predicate: (query) =>
            query.queryKey[0] === "notifications" &&
            typeof query.queryKey[1] === "number",
        },
        (old) =>
          old
            ? {
                ...old,
                notifications: old.notifications.map((item) =>
                  idSet.has(item.notificationRecipientId)
                    ? { ...item, isRead: true, readAt: new Date().toISOString() }
                    : item,
                ),
              }
            : old,
      );

      queryClient.setQueryData(["notifications", "infinite"], (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            notifications: page.notifications.map((item: Notification) =>
              idSet.has(item.notificationRecipientId)
                ? { ...item, isRead: true, readAt: new Date().toISOString() }
                : item,
            ),
          })),
        };
      });

      queryClient.setQueryData<UnreadCountResponse>(
        ["notifications", "unreadCount"],
        { unreadCount: data.unreadCount },
      );
    };

    const handleNotificationArchived = (data: {
      notificationRecipientId: string;
      unreadCount: number;
    }) => {
      useNotificationStore.getState().setUnreadCount(data.unreadCount);
      const currentNotifs = useNotificationStore.getState().notifications;
      useNotificationStore.setState({
        notifications: currentNotifs.filter(
          (n) => n.notificationRecipientId !== data.notificationRecipientId,
        ),
      });

      queryClient.setQueriesData<NotificationListResponse>(
        {
          predicate: (query) =>
            query.queryKey[0] === "notifications" &&
            typeof query.queryKey[1] === "number",
        },
        (old) =>
          old
            ? {
                ...old,
                notifications: old.notifications.filter(
                  (n) => n.notificationRecipientId !== data.notificationRecipientId,
                ),
              }
            : old,
      );

      queryClient.setQueryData(["notifications", "infinite"], (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            notifications: page.notifications.filter(
              (n: Notification) =>
                n.notificationRecipientId !== data.notificationRecipientId,
            ),
          })),
        };
      });

      queryClient.setQueryData<UnreadCountResponse>(
        ["notifications", "unreadCount"],
        { unreadCount: data.unreadCount },
      );
    };

    // Conversation Events
    const handleNewConversation = (data: { conversation: Conversation }) => {
      queryClient.setQueryData<Conversation[]>(
        ["conversations"],
        (old = []) => {
          if (old.find((c) => c.id === data.conversation.id)) return old;
          return [data.conversation, ...old];
        },
      );
      socketService.emit("conversation:join", {
        conversationId: data.conversation.id,
      });
    };

    const handleConversationUpdated = (data: {
      conversation: Partial<Conversation> & { id: string };
    }) => {
      queryClient.setQueryData<Conversation[]>(["conversations"], (old = []) =>
        old.map((c) =>
          c.id === data.conversation.id ? { ...c, ...data.conversation } : c,
        ),
      );
      queryClient.setQueryData<Conversation>(
        ["conversation", data.conversation.id],
        (old) => (old ? { ...old, ...data.conversation } : old),
      );
    };

    const handleConversationArchived = (data: { conversationId: string }) => {
      queryClient.setQueryData<Conversation[]>(["conversations"], (old = []) =>
        old.filter((c) => c.id !== data.conversationId),
      );
      if (useChatStore.getState().activeConversationId === data.conversationId) {
        useChatStore.getState().setActiveConversationId(null);
        void navigate("/chat");
      }
    };

    const handleMemberRemoved = (data: {
      conversationId: string;
      userId: string;
    }) => {
      const currentUserId = useAuthStore.getState().currentUser?.id;
      if (data.userId === currentUserId) {
        socketService.emit("conversation:leave", {
          conversationId: data.conversationId,
        });
        queryClient.setQueryData<Conversation[]>(
          ["conversations"],
          (old = []) => old.filter((c) => c.id !== data.conversationId),
        );
        if (
          useChatStore.getState().activeConversationId === data.conversationId
        ) {
          useChatStore.getState().setActiveConversationId(null);
          void navigate("/chat");
        }
      } else {
        queryClient.invalidateQueries({
          queryKey: ["conversation", data.conversationId],
        });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }
    };

    const handleReadUpdate = (data: {
      conversationId: string;
      userId: string;
      lastReadAt: string;
    }) => {
      queryClient.setQueryData<Conversation[]>(["conversations"], (old = []) =>
        old.map((c) => {
          if (c.id === data.conversationId) {
            const updatedMembers =
              c.members?.map((m) =>
                m.userId === data.userId
                  ? { ...m, lastReadAt: data.lastReadAt }
                  : m,
              ) || c.members;
            return { ...c, members: updatedMembers };
          }
          return c;
        }),
      );
      queryClient.setQueryData<Conversation>(
        ["conversation", data.conversationId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            members:
              old.members?.map((m) =>
                m.userId === data.userId
                  ? { ...m, lastReadAt: data.lastReadAt }
                  : m,
              ) || old.members,
          };
        },
      );
    };

    // Ephemeral Events
    const handleTypingUpdate = (data: {
      conversationId: string;
      userId: string;
      fullName: string;
      isTyping: boolean;
    }) => {
      if (data.isTyping) {
        addTypingUser(data.conversationId, {
          userId: data.userId,
          userName: data.fullName,
        });
      } else {
        removeTypingUser(data.conversationId, data.userId);
      }
    };

    const handlePresenceUpdate = (data: {
      userId: string;
      status: "online" | "offline";
    }) => {
      updatePresence(data.userId, data.status);
    };

    // Reconnection healing
    const handleReconnected = () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({
        queryKey: ["notifications", "unreadCount"],
      });
    };

    // Attach listeners
    socketService.on("message:new", handleNewMessage);
    socketService.on("message:updated", handleMessageUpdated);
    socketService.on("message:deleted", handleMessageDeleted);
    socketService.on("message:reaction_updated", handleReactionUpdated);
    socketService.on("notification:new", handleNewNotification);
    socketService.on("notification:read", handleNotificationRead);
    socketService.on("notification:read_all", handleNotificationReadAll);
    socketService.on(
      "notification:conversation_read",
      handleNotificationConversationRead,
    );
    socketService.on("notification:archived", handleNotificationArchived);
    socketService.on("conversation:new", handleNewConversation);
    socketService.on("conversation:updated", handleConversationUpdated);
    socketService.on("conversation:archived", handleConversationArchived);
    socketService.on("conversation:member_removed", handleMemberRemoved);
    socketService.on("conversation:read_update", handleReadUpdate);
    socketService.on("typing:update", handleTypingUpdate);
    socketService.on("presence:update", handlePresenceUpdate);
    window.addEventListener("chat:reconnected", handleReconnected);

    // Cleanup
    return () => {
      unsubscribe();
      socketService.off("message:new", handleNewMessage);
      socketService.off("message:updated", handleMessageUpdated);
      socketService.off("message:deleted", handleMessageDeleted);
      socketService.off("message:reaction_updated", handleReactionUpdated);
      socketService.off("notification:new", handleNewNotification);
      socketService.off("notification:read", handleNotificationRead);
      socketService.off("notification:read_all", handleNotificationReadAll);
      socketService.off(
        "notification:conversation_read",
        handleNotificationConversationRead,
      );
      socketService.off("notification:archived", handleNotificationArchived);
      socketService.off("conversation:new", handleNewConversation);
      socketService.off("conversation:updated", handleConversationUpdated);
      socketService.off("conversation:archived", handleConversationArchived);
      socketService.off("conversation:member_removed", handleMemberRemoved);
      socketService.off("conversation:read_update", handleReadUpdate);
      socketService.off("typing:update", handleTypingUpdate);
      socketService.off("presence:update", handlePresenceUpdate);
      window.removeEventListener("chat:reconnected", handleReconnected);
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
      socketService.emit("conversation:focus", {
        conversationId: activeConversationId,
      });
    }

    return () => {
      socketService.emit("conversation:blur");
    };
  }, [activeConversationId, isSocketConnected]);
};
