import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ConversationList } from '../components/chat/Sidebar/ConversationList';
import { ChatWindow } from '../components/chat/Window/ChatWindow';
import { useChatStore } from '../store/useChatStore';

export const ChatPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const { activeConversationId, setActiveConversationId } = useChatStore();

  useEffect(() => {
    if (conversationId && conversationId !== activeConversationId) {
      setActiveConversationId(conversationId);
    } else if (!conversationId && activeConversationId) {
      setActiveConversationId(null);
    }
  }, [conversationId, activeConversationId, setActiveConversationId]);

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 min-w-0 w-full bg-white overflow-hidden">
      <div className="flex-1 flex min-h-0 min-w-0 h-full w-full overflow-hidden">
        <ConversationList />
        <ChatWindow />
      </div>
    </div>
  );
};
