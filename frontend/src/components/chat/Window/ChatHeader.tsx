import React, { useState } from 'react';
import {
  MoreVertical,
  Search,
  X,
  Trash2,
  UserPlus,
  Check,
  ArrowLeft,
  Upload,
  Loader2,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuthStore } from '../../../store/useAuthStore';
import { useChatStore } from '../../../store/useChatStore';
import { chatService } from '../../../services/chat.service';
import { socketService } from '../../../services/socket.service';
import type { Conversation, Message } from '../../../types/chat';
import { ConversationMenu } from '../ContextMenus/ConversationMenu';
import {
  getConversationDisplayName,
  getConversationInitials,
  getConversationAvatar,
  getOtherParticipant,
} from '../../../utils/chatHelpers';

interface ChatHeaderProps {
  conversation: Conversation;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ conversation }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeModal, setActiveModal] = useState<
    'members' | 'addMembers' | 'rename' | 'avatar' | null
  >(null);
  const [inputValue, setInputValue] = useState('');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const currentUserId = useAuthStore((state) => state.currentUser?.id);
  const presenceMap = useChatStore((state) => state.presenceMap);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const getChatName = () => getConversationDisplayName(conversation, currentUserId);

  const getMemberCount = () => {
    return conversation._count?.members || conversation.members?.length || 0;
  };

  const otherParticipant = getOtherParticipant(conversation, currentUserId);
  const isOtherOnline = otherParticipant
    ? presenceMap[otherParticipant.userId] === 'online'
    : false;
  const currentUserMember = conversation.members?.find((m) => m.userId === currentUserId);
  const hasAdminRights =
    currentUserMember?.role === 'owner' || currentUserMember?.role === 'admin';

  const { data: searchResults = [], isFetching: isSearching } = useQuery<Message[]>({
    queryKey: ['messages-search', conversation.id, searchQuery],
    queryFn: () => chatService.searchMessages(conversation.id, searchQuery.trim()),
    enabled: isSearchOpen && searchQuery.trim().length > 0,
  });

  const { data: usersData } = useQuery({
    queryKey: ['chat-users', userSearchTerm],
    queryFn: () => chatService.searchUsers({ search: userSearchTerm, limit: 20 }),
    enabled: activeModal === 'addMembers',
  });

  const handleOptionsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({ x: rect.right, y: rect.bottom + 8 });
    setMenuOpen((prev) => !prev);
  };

  const handleRenameSubmit = async () => {
    if (!inputValue.trim()) return;
    try {
      const updated = await chatService.updateConversation(conversation.id, {
        title: inputValue.trim(),
      });
      queryClient.setQueryData<Conversation>(['conversation', conversation.id], (old) =>
        old ? { ...old, ...updated } : old,
      );
      queryClient.setQueryData<Conversation[]>(['conversations'], (old = []) =>
        old.map((c) => (c.id === conversation.id ? { ...c, ...updated } : c)),
      );
      setActiveModal(null);
    } catch (err) {
      console.error('Failed to rename conversation:', err);
    }
  };

  const handleAvatarSubmit = async () => {
    try {
      const updated = await chatService.updateConversation(conversation.id, {
        avatarUrl: inputValue.trim(),
      });
      queryClient.setQueryData<Conversation>(['conversation', conversation.id], (old) =>
        old ? { ...old, ...updated } : old,
      );
      queryClient.setQueryData<Conversation[]>(['conversations'], (old = []) =>
        old.map((c) => (c.id === conversation.id ? { ...c, ...updated } : c)),
      );
      setActiveModal(null);
    } catch (err) {
      console.error('Failed to update avatar:', err);
    }
  };

  const handleAvatarFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingAvatar(true);
    try {
      const uploaded = await chatService.uploadAttachment(file);
      if (uploaded?.url) {
        setInputValue(uploaded.url);
      }
    } catch (err) {
      console.error('Failed to upload avatar to Cloudinary:', err);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleArchive = async () => {
    try {
      await chatService.archiveConversation(conversation.id);
      queryClient.setQueryData<Conversation[]>(['conversations'], (old = []) =>
        old.filter((c) => c.id !== conversation.id),
      );
      navigate('/chat');
    } catch (err) {
      console.error('Failed to archive conversation:', err);
    }
  };

  const handleLeave = async () => {
    if (!currentUserId) return;
    try {
      await chatService.removeMember(conversation.id, currentUserId);
      socketService.emit('conversation:leave', { conversationId: conversation.id });
      queryClient.setQueryData<Conversation[]>(['conversations'], (old = []) =>
        old.filter((c) => c.id !== conversation.id),
      );
      navigate('/chat');
    } catch (err) {
      console.error('Failed to leave conversation:', err);
    }
  };

  const handleRemoveMember = async (memberUserId: string) => {
    try {
      await chatService.removeMember(conversation.id, memberUserId);
      await queryClient.invalidateQueries({ queryKey: ['conversation', conversation.id] });
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  };

  const handleAddMember = async (userId: string) => {
    try {
      await chatService.addMember(conversation.id, userId);
      await queryClient.invalidateQueries({ queryKey: ['conversation', conversation.id] });
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (err) {
      console.error('Failed to add member:', err);
    }
  };

  const existingMemberIds = new Set((conversation.members || []).map((m) => m.userId));
  const candidateUsers = (usersData?.users || []).filter(
    (u) => !existingMemberIds.has(u.id),
  );

  return (
    <div className="border-b border-neutral-200 bg-white flex flex-col shrink-0 shadow-sm z-10 relative">
      <div className="h-16 flex items-center justify-between px-4 sm:px-6 gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => navigate('/chat')}
            className="md:hidden p-2 -ml-1 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded-full transition-colors shrink-0"
            title="Back to conversations"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="relative shrink-0">
            {getConversationAvatar(conversation, currentUserId) ? (
              <img
                src={getConversationAvatar(conversation, currentUserId)}
                alt="Avatar"
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-lg">
                {getConversationInitials(conversation, currentUserId)}
              </div>
            )}
            {conversation.type === 'direct' && isOtherOnline && (
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
            )}
          </div>

          <div className="flex flex-col min-w-0">
            <h2 className="font-semibold text-neutral-800 text-base sm:text-lg leading-tight tracking-tight truncate">
              {getChatName()}
            </h2>
            {conversation.type === 'group' ? (
              <span className="text-xs text-neutral-500">
                {getMemberCount()} members
              </span>
            ) : (
              <span
                className={`text-xs ${
                  isOtherOnline ? 'text-green-600 font-medium' : 'text-neutral-400'
                }`}
              >
                {isOtherOnline ? 'Online' : 'Offline'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setIsSearchOpen((prev) => !prev);
              setSearchQuery('');
            }}
            className={`p-2 rounded-full transition-colors ${
              isSearchOpen
                ? 'text-brand-600 bg-brand-50'
                : 'text-neutral-400 hover:text-brand-600 hover:bg-brand-50'
            }`}
            title="Search in conversation"
          >
            <Search size={20} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleOptionsClick}
            className="p-2 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-full transition-colors ml-1"
            title="Conversation options"
          >
            <MoreVertical size={20} />
          </button>
        </div>
      </div>

      {/* In-Conversation Search Bar & Results */}
      {isSearchOpen && (
        <div className="px-4 sm:px-6 py-2.5 bg-neutral-50 border-t border-neutral-200 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-neutral-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages in this conversation..."
              className="flex-1 bg-white border border-neutral-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
              autoFocus
            />
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen(false);
                setSearchQuery('');
              }}
              className="p-1 text-neutral-400 hover:text-neutral-600"
            >
              <X size={16} />
            </button>
          </div>

          {searchQuery.trim().length > 0 && (
            <div className="max-h-48 overflow-y-auto bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100">
              {isSearching ? (
                <div className="p-3 text-xs text-neutral-500 text-center">Searching...</div>
              ) : searchResults.length === 0 ? (
                <div className="p-3 text-xs text-neutral-500 text-center">
                  No matching messages found.
                </div>
              ) : (
                searchResults.map((msg) => (
                  <div key={msg.id} className="px-3 py-2 text-xs hover:bg-neutral-50">
                    <div className="flex justify-between text-neutral-500 mb-0.5">
                      <span className="font-semibold text-neutral-800">
                        {msg.sender?.fullName || 'User'}
                      </span>
                      <span>{format(new Date(msg.createdAt), 'dd/MM/yyyy HH:mm')}</span>
                    </div>
                    <p className="text-neutral-700 truncate">{msg.content}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <ConversationMenu
        conversation={conversation}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        position={menuPos}
        onViewMembers={() => setActiveModal('members')}
        onAddMembers={() => {
          setUserSearchTerm('');
          setActiveModal('addMembers');
        }}
        onArchive={handleArchive}
        onRename={() => {
          setInputValue(conversation.title || '');
          setActiveModal('rename');
        }}
        onChangeAvatar={() => {
          setInputValue(conversation.avatarUrl || '');
          setActiveModal('avatar');
        }}
        onLeave={handleLeave}
      />

      {/* Modals for View Members / Add Members / Rename / Change Avatar */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between p-4 border-b border-neutral-100">
              <h3 className="font-bold text-neutral-800 text-base">
                {activeModal === 'members' && 'Conversation Members'}
                {activeModal === 'addMembers' && 'Add Members'}
                {activeModal === 'rename' && 'Rename Group'}
                {activeModal === 'avatar' && 'Change Group Avatar'}
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1.5 text-neutral-400 hover:text-neutral-600 rounded-full hover:bg-neutral-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {activeModal === 'members' && (
                <ul className="divide-y divide-neutral-100">
                  {(conversation.members || []).map((m) => (
                    <li key={m.userId} className="py-2.5 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-neutral-800">
                          {m.user?.fullName || m.userId}
                          {m.userId === currentUserId && ' (You)'}
                        </p>
                        <p className="text-xs text-neutral-500 capitalize">{m.role}</p>
                      </div>
                      {hasAdminRights &&
                        m.userId !== currentUserId &&
                        conversation.type === 'group' && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(m.userId)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove member"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                    </li>
                  ))}
                </ul>
              )}

              {activeModal === 'addMembers' && (
                <div className="flex flex-col gap-3">
                  <input
                    type="text"
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    placeholder="Search users to add..."
                    className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                  <ul className="divide-y divide-neutral-100 max-h-60 overflow-y-auto">
                    {candidateUsers.length === 0 ? (
                      <li className="py-4 text-center text-xs text-neutral-400">
                        No users available to add.
                      </li>
                    ) : (
                      candidateUsers.map((u) => (
                        <li key={u.id} className="py-2.5 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-neutral-800">
                              {u.fullName}
                            </p>
                            <p className="text-xs text-neutral-500">{u.email}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddMember(u.id)}
                            className="px-3 py-1.5 bg-brand-50 text-brand-600 hover:bg-brand-100 rounded-lg text-xs font-medium flex items-center gap-1"
                          >
                            <UserPlus size={14} /> Add
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}

              {(activeModal === 'rename' || activeModal === 'avatar') && (
                <div className="flex flex-col gap-3">
                  {activeModal === 'avatar' && (
                    <label className="flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-brand-300 bg-brand-50/50 hover:bg-brand-50 text-brand-600 rounded-xl cursor-pointer text-xs font-medium transition-colors">
                      {isUploadingAvatar ? (
                        <>
                          <Loader2 size={15} className="animate-spin" /> Uploading to Cloudinary...
                        </>
                      ) : (
                        <>
                          <Upload size={15} /> Upload Image File
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarFileUpload}
                        disabled={isUploadingAvatar}
                      />
                    </label>
                  )}

                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={
                      activeModal === 'rename'
                        ? 'Enter new group title'
                        : 'Or paste image URL...'
                    }
                    className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="px-4 py-2 text-xs font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isUploadingAvatar}
                      onClick={
                        activeModal === 'rename' ? handleRenameSubmit : handleAvatarSubmit
                      }
                      className="px-4 py-2 text-xs font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 flex items-center gap-1 disabled:opacity-50"
                    >
                      <Check size={14} /> Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
