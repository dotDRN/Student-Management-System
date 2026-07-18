import React from 'react';
import { ConversationList } from '../components/chat/Sidebar/ConversationList';
import { ChatWindow } from '../components/chat/Window/ChatWindow';

export const ChatPage: React.FC = () => {
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
