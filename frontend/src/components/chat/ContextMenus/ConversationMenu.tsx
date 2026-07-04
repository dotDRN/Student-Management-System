import React, { useRef, useEffect } from 'react';
import { Users, UserPlus, Archive, Edit3, Image as ImageIcon, LogOut } from 'lucide-react';
import type { Conversation, ConversationMember } from '../../../types/chat';
import { useAuthStore } from '../../../store/useAuthStore';

interface ConversationMenuProps {
  conversation: Conversation;
  isOpen: boolean;
  onClose: () => void;
  onViewMembers: () => void;
  onAddMembers: () => void;
  onArchive: () => void;
  onRename: () => void;
  onChangeAvatar: () => void;
  onLeave: () => void;
  position: { x: number; y: number };
}

export const ConversationMenu: React.FC<ConversationMenuProps> = ({
  conversation,
  isOpen,
  onClose,
  onViewMembers,
  onAddMembers,
  onArchive,
  onRename,
  onChangeAvatar,
  onLeave,
  position
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const currentUserId = useAuthStore((state) => state.currentUser?.id);

  const currentUserMember = conversation.members?.find((m: ConversationMember) => m.userId === currentUserId);
  const hasAdminRights = currentUserMember?.role === 'OWNER' || currentUserMember?.role === 'ADMIN';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-56 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 text-sm font-medium text-neutral-700"
      style={{ top: position.y, right: window.innerWidth - position.x }}
    >
      <button
        onClick={() => { onViewMembers(); onClose(); }}
        className="w-full flex items-center px-4 py-2 hover:bg-neutral-50 transition-colors"
      >
        <Users size={16} className="mr-3 text-neutral-500" />
        View Members
      </button>

      {hasAdminRights && conversation.type === 'GROUP' && (
        <>
          <button
            onClick={() => { onAddMembers(); onClose(); }}
            className="w-full flex items-center px-4 py-2 hover:bg-neutral-50 transition-colors"
          >
            <UserPlus size={16} className="mr-3 text-neutral-500" />
            Add Members
          </button>
          
          <button
            onClick={() => { onRename(); onClose(); }}
            className="w-full flex items-center px-4 py-2 hover:bg-neutral-50 transition-colors"
          >
            <Edit3 size={16} className="mr-3 text-neutral-500" />
            Rename Group
          </button>
          
          <button
            onClick={() => { onChangeAvatar(); onClose(); }}
            className="w-full flex items-center px-4 py-2 hover:bg-neutral-50 transition-colors"
          >
            <ImageIcon size={16} className="mr-3 text-neutral-500" />
            Change Avatar
          </button>
          
          <div className="h-px bg-neutral-200 my-1 mx-2" />
          
          <button
            onClick={() => { onArchive(); onClose(); }}
            className="w-full flex items-center px-4 py-2 hover:bg-orange-50 text-orange-600 transition-colors"
          >
            <Archive size={16} className="mr-3 text-orange-500" />
            Archive Group
          </button>
        </>
      )}

      {conversation.type === 'GROUP' && (
        <button
          onClick={() => { onLeave(); onClose(); }}
          className="w-full flex items-center px-4 py-2 hover:bg-red-50 text-red-600 transition-colors"
        >
          <LogOut size={16} className="mr-3 text-red-500" />
          Leave Group
        </button>
      )}
    </div>
  );
};
