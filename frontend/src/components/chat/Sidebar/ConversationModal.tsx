import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Search, Check, Users } from 'lucide-react';
import { listUsers } from '../../../services/users.service';
import { chatService } from '../../../services/chat.service';
import { useChatStore } from '../../../store/useChatStore';

interface ConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConversationModal: React.FC<ConversationModalProps> = ({ isOpen, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  
  const queryClient = useQueryClient();
  const { setActiveConversationId } = useChatStore();

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const { data: usersData, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['users', debouncedSearch],
    queryFn: () => listUsers({ search: debouncedSearch, limit: 20 }),
    enabled: isOpen,
  });

  const createMutation = useMutation({
    mutationFn: (data: { type: 'direct' | 'group'; title?: string; members: { userId: string }[] }) => {
      return chatService.createConversation(data);
    },
    onSuccess: (newConversation) => {
      // Update cache
      queryClient.setQueryData<any[]>(['conversations'], (old = []) => {
        if (old.find((c) => c.id === newConversation.id)) return old;
        return [newConversation, ...old];
      });
      // Focus and navigate
      setActiveConversationId(newConversation.id);
      onClose();
      // Reset state
      setSelectedUserIds(newSet => new Set());
      setSearchTerm('');
      setGroupName('');
    },
  });

  if (!isOpen) return null;

  const toggleUserSelection = (userId: string) => {
    const newSelection = new Set(selectedUserIds);
    if (newSelection.has(userId)) {
      newSelection.delete(userId);
    } else {
      newSelection.add(userId);
    }
    setSelectedUserIds(newSelection);
  };

  const handleCreate = () => {
    if (selectedUserIds.size === 0) return;

    if (selectedUserIds.size === 1) {
      createMutation.mutate({
        type: 'direct',
        members: Array.from(selectedUserIds).map(userId => ({ userId })),
      });
    } else {
      if (!groupName.trim()) {
        alert('Group Name is required for group conversations.');
        return;
      }
      createMutation.mutate({
        type: 'group',
        title: groupName,
        members: Array.from(selectedUserIds).map(userId => ({ userId })),
      });
    }
  };

  const isGroup = selectedUserIds.size > 1;
  const users = usersData?.users || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-100">
          <h2 className="text-lg font-bold text-neutral-800 flex items-center gap-2" style={{ fontFamily: 'var(--font-heading)' }}>
            <Users size={20} className="text-brand-500" />
            New Conversation
          </h2>
          <button 
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col gap-4 flex-1 overflow-hidden">
          
          {/* Search */}
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-neutral-100 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm text-neutral-800 focus:ring-2 focus:ring-brand-500/20 focus:bg-white outline-none transition-all"
            />
          </div>

          {/* Group Name Input */}
          {isGroup && (
            <div className="animate-in fade-in slide-in-from-top-2">
              <label className="block text-xs font-medium text-neutral-500 mb-1 ml-1">Group Name *</label>
              <input
                type="text"
                placeholder="Enter group name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full border border-neutral-200 rounded-xl py-2.5 px-4 text-sm text-neutral-800 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
              />
            </div>
          )}

          {/* User List */}
          <div className="flex-1 overflow-y-auto min-h-[200px] border border-neutral-100 rounded-xl">
            {isLoadingUsers ? (
              <div className="flex justify-center items-center h-full text-neutral-400">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500"></div>
              </div>
            ) : users.length === 0 ? (
              <div className="flex justify-center items-center h-full text-sm text-neutral-400 p-4 text-center">
                No users found matching "{searchTerm}"
              </div>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {users.map(user => {
                  const isSelected = selectedUserIds.has(user.id);
                  return (
                    <li 
                      key={user.id}
                      onClick={() => toggleUserSelection(user.id)}
                      className={`flex items-center justify-between p-3 cursor-pointer hover:bg-neutral-50 transition-colors ${isSelected ? 'bg-brand-50/50' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                          {user.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-neutral-800">{user.fullName}</p>
                          <p className="text-xs text-neutral-500">{user.email}</p>
                        </div>
                      </div>
                      
                      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-brand-500 border-brand-500' : 'border-neutral-300'}`}>
                        {isSelected && <Check size={14} className="text-white" />}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors shadow-sm"
          >
            Cancel
          </button>
          <button 
            onClick={handleCreate}
            disabled={selectedUserIds.size === 0 || createMutation.isPending}
            className="px-5 py-2 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm shadow-brand-500/25 flex items-center gap-2"
          >
            {createMutation.isPending && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
            {isGroup ? 'Create Group' : 'Start Chat'}
          </button>
        </div>

      </div>
    </div>
  );
};
