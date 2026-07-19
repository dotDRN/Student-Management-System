import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ConversationList } from '../components/chat/Sidebar/ConversationList';
import { ChatWindow } from '../components/chat/Window/ChatWindow';
import { useChatStore } from '../store/useChatStore';

export const ChatPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const { activeConversationId, setActiveConversationId } = useChatStore();
  const navigate = useNavigate();

  useEffect(() => {
    // If the URL has an ID but the store doesn't match, update the store.
    if (conversationId && conversationId !== activeConversationId) {
      setActiveConversationId(conversationId);
    } 
    // If the URL doesn't have an ID but the store does, clear the store.
    else if (!conversationId && activeConversationId) {
      setActiveConversationId(null);
    }
  }, [conversationId, activeConversationId, setActiveConversationId]);

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full bg-white overflow-hidden">
      {/* 
        On mobile, we would conditionally hide the sidebar if a conversation is active. 
        For this implementation, we use standard CSS flex wrapping / responsive hiding. 
      */}
      <div className="flex-1 flex min-h-0 w-full">
        <ConversationList />
        <ChatWindow />
      </div>
    </div>
  );
};
