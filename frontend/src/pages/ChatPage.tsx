import React, { useEffect } from 'react';
import { ConversationList } from '../components/chat/Sidebar/ConversationList';
import { ChatWindow } from '../components/chat/Window/ChatWindow';
import { socketService } from '../services/socket.service';
import { useChatStore } from '../store/useChatStore';
import { useChatSocket } from '../hooks/useChatSocket';

export const ChatPage: React.FC = () => {
  const { resetChatState } = useChatStore();

  useChatSocket();

  useEffect(() => {
    // Connect to socket when mounting the chat page
    socketService.connect();

    return () => {
      socketService.disconnect();
      resetChatState();
    };
  }, [resetChatState]);

  return (
    <div className="flex h-[calc(100vh-4rem)] md:h-screen w-full bg-white overflow-hidden">
      {/* 
        On mobile, we would conditionally hide the sidebar if a conversation is active. 
        For this implementation, we use standard CSS flex wrapping / responsive hiding. 
      */}
      <div className="flex w-full h-full">
        <ConversationList />
        <ChatWindow />
      </div>
    </div>
  );
};
