import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
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
  position,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const currentUserId = useAuthStore((state) => state.currentUser?.id);
  const [coords, setCoords] = useState<{ top: number; left: number }>({
    top: position.y,
    left: Math.max(12, position.x - 224),
  });

  const currentUserMember = conversation.members?.find(
    (m: ConversationMember) => m.userId === currentUserId,
  );
  const hasAdminRights =
    currentUserMember?.role === 'owner' || currentUserMember?.role === 'admin';

  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;

    let left = position.x - rect.width;
    left = Math.max(margin, Math.min(left, vw - rect.width - margin));

    let top = position.y;
    if (top + rect.height + margin > vh) {
      top = position.y - rect.height - 8;
    }
    top = Math.max(margin, Math.min(top, vh - rect.height - margin));

    setCoords({ top, left });
  }, [isOpen, position.x, position.y]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', onClose);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', onClose);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-56 max-h-[calc(100vh-24px)] overflow-y-auto bg-white border border-neutral-200 rounded-xl shadow-xl py-1.5 text-sm font-medium text-neutral-700"
      style={{ top: coords.top, left: coords.left }}
    >
      <button
        type="button"
        onClick={() => {
          onViewMembers();
          onClose();
        }}
        className="w-full flex items-center px-4 py-2 hover:bg-neutral-50 transition-colors"
      >
        <Users size={16} className="mr-3 text-neutral-500 shrink-0" />
        View Members
      </button>

      {hasAdminRights && conversation.type === 'group' && (
        <>
          <button
            type="button"
            onClick={() => {
              onAddMembers();
              onClose();
            }}
            className="w-full flex items-center px-4 py-2 hover:bg-neutral-50 transition-colors"
          >
            <UserPlus size={16} className="mr-3 text-neutral-500 shrink-0" />
            Add Members
          </button>

          <button
            type="button"
            onClick={() => {
              onRename();
              onClose();
            }}
            className="w-full flex items-center px-4 py-2 hover:bg-neutral-50 transition-colors"
          >
            <Edit3 size={16} className="mr-3 text-neutral-500 shrink-0" />
            Rename Group
          </button>

          <button
            type="button"
            onClick={() => {
              onChangeAvatar();
              onClose();
            }}
            className="w-full flex items-center px-4 py-2 hover:bg-neutral-50 transition-colors"
          >
            <ImageIcon size={16} className="mr-3 text-neutral-500 shrink-0" />
            Change Avatar
          </button>
        </>
      )}

      {hasAdminRights && (
        <>
          <div className="h-px bg-neutral-200 my-1 mx-2" />
          <button
            type="button"
            onClick={() => {
              onArchive();
              onClose();
            }}
            className="w-full flex items-center px-4 py-2 hover:bg-orange-50 text-orange-600 transition-colors"
          >
            <Archive size={16} className="mr-3 text-orange-500 shrink-0" />
            Archive Conversation
          </button>
        </>
      )}

      {conversation.type === 'group' && (
        <button
          type="button"
          onClick={() => {
            onLeave();
            onClose();
          }}
          className="w-full flex items-center px-4 py-2 hover:bg-red-50 text-red-600 transition-colors"
        >
          <LogOut size={16} className="mr-3 text-red-500 shrink-0" />
          Leave Group
        </button>
      )}
    </div>
  );
};
