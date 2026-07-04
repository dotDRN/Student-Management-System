import React, { useState } from 'react';
import { MoreVertical, Phone, Video, Search } from 'lucide-react';
import type { Conversation } from '../../../types/chat';
import { ConversationMenu } from '../ContextMenus/ConversationMenu';

interface ChatHeaderProps {
  conversation: Conversation;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ conversation }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const getChatName = () => {
    if (conversation.type === 'GROUP') {
      return conversation.name || 'Unnamed Group';
    }
    // For direct message, return the other member's name
    // We assume the caller or the state handles finding the "other" member's name properly
    return conversation.name || 'Direct Message';
  };

  const getMemberCount = () => {
    return conversation._count?.members || conversation.members?.length || 0;
  };

  const handleOptionsClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({ x: rect.right, y: rect.bottom + 8 });
    setMenuOpen(!menuOpen);
  };

  return (
    <div className="h-16 border-b border-neutral-200 bg-white flex items-center justify-between px-6 shrink-0 shadow-sm z-10">
      <div className="flex items-center gap-3">
        {conversation.avatarUrl ? (
          <img src={conversation.avatarUrl} alt="Avatar" className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-lg">
            {getChatName().charAt(0).toUpperCase()}
          </div>
        )}
        
        <div className="flex flex-col">
          <h2 className="font-semibold text-neutral-800 text-lg leading-tight tracking-tight">
            {getChatName()}
          </h2>
          {conversation.type === 'GROUP' && (
            <span className="text-xs text-neutral-500">
              {getMemberCount()} members
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <button className="p-2 text-neutral-400 hover:text-brand-600 hover:bg-brand-50 rounded-full transition-colors hidden sm:block">
          <Search size={20} />
        </button>
        <button className="p-2 text-neutral-400 hover:text-brand-600 hover:bg-brand-50 rounded-full transition-colors hidden sm:block">
          <Phone size={20} />
        </button>
        <button className="p-2 text-neutral-400 hover:text-brand-600 hover:bg-brand-50 rounded-full transition-colors hidden sm:block">
          <Video size={20} />
        </button>
        <button 
          onClick={handleOptionsClick}
          className="p-2 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-full transition-colors ml-1"
        >
          <MoreVertical size={20} />
        </button>
      </div>

      <ConversationMenu
        conversation={conversation}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        position={menuPos}
        onViewMembers={() => console.log('View Members')}
        onAddMembers={() => console.log('Add Members')}
        onArchive={() => console.log('Archive')}
        onRename={() => console.log('Rename')}
        onChangeAvatar={() => console.log('Change Avatar')}
        onLeave={() => console.log('Leave')}
      />
    </div>
  );
};
