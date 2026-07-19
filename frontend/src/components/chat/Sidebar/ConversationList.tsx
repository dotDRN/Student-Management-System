import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, MessageSquare } from 'lucide-react';
import { chatService } from '../../../services/chat.service';
import { useChatStore } from '../../../store/useChatStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { ConversationItem } from './ConversationItem';
import { ConversationModal } from './ConversationModal';
import { getConversationDisplayName } from '../../../utils/chatHelpers';

export const ConversationList: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { activeConversationId } = useChatStore();
  const currentUserId = useAuthStore((state) => state.currentUser?.id);
  const navigate = useNavigate();

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => chatService.getUserConversations(),
  });

  const filteredConversations = conversations?.filter(c => {
    if (!searchTerm) return true;
    const name = getConversationDisplayName(c, currentUserId);
    return name.toLowerCase().includes(searchTerm.toLowerCase());
  }) || [];

  return (
    <div className="w-full md:w-80 lg:w-96 flex flex-col h-full bg-white border-r border-neutral-200 shrink-0 z-20">
      {/* Header & Search */}
      <div className="p-4 border-b border-neutral-200">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-bold text-neutral-800" style={{ fontFamily: 'var(--font-heading)' }}>
            Messages
          </h1>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="p-2 bg-brand-50 text-brand-600 rounded-full hover:bg-brand-100 transition-colors shadow-sm"
          >
            <Plus size={18} />
          </button>
        </div>
        
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-neutral-100 border-none rounded-xl py-2 pl-9 pr-4 text-sm text-neutral-800 focus:ring-2 focus:ring-brand-500/20 focus:bg-white outline-none transition-all"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-neutral-400">
            <MessageSquare size={48} className="mb-4 opacity-20" />
            <p className="text-sm text-center">No conversations found.</p>
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={activeConversationId === conv.id}
              onClick={() => navigate(`/chat/${conv.id}`)}
            />
          ))
        )}
      </div>

      <ConversationModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </div>
  );
};
