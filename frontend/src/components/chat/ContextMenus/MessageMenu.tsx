import React, { useRef, useEffect } from 'react';
import { Reply, Edit2, Trash2, Copy, SmilePlus } from 'lucide-react';
import type { Message } from '../../../types/chat';
import { useAuthStore } from '../../../store/useAuthStore';

interface MessageMenuProps {
  message: Message;
  isOpen: boolean;
  onClose: () => void;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onReact: (messageId: string) => void;
  position: { x: number; y: number };
}

export const MessageMenu: React.FC<MessageMenuProps> = ({
  message,
  isOpen,
  onClose,
  onReply,
  onEdit,
  onDelete,
  onReact,
  position
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const currentUserId = useAuthStore((state) => state.currentUser?.id);

  const isSender = message.senderId === currentUserId;

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

  const handleCopy = () => {
    if (message.content) {
      navigator.clipboard.writeText(message.content);
    }
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-48 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 text-sm font-medium text-neutral-700"
      style={{ top: position.y, left: position.x }}
    >
      <button
        onClick={() => { onReply(message); onClose(); }}
        className="w-full flex items-center px-4 py-2 hover:bg-neutral-50 transition-colors"
      >
        <Reply size={16} className="mr-3 text-neutral-500" />
        Reply
      </button>

      <button
        onClick={handleCopy}
        className="w-full flex items-center px-4 py-2 hover:bg-neutral-50 transition-colors"
      >
        <Copy size={16} className="mr-3 text-neutral-500" />
        Copy
      </button>

      {!isSender && (
        <button
          onClick={() => { onReact(message.id); onClose(); }}
          className="w-full flex items-center px-4 py-2 hover:bg-neutral-50 transition-colors"
        >
          <SmilePlus size={16} className="mr-3 text-neutral-500" />
          React
        </button>
      )}

      {isSender && (
        <>
          <button
            onClick={() => { onEdit(message); onClose(); }}
            className="w-full flex items-center px-4 py-2 hover:bg-neutral-50 transition-colors"
          >
            <Edit2 size={16} className="mr-3 text-neutral-500" />
            Edit
          </button>
          
          <div className="h-px bg-neutral-200 my-1 mx-2" />
          
          <button
            onClick={() => { onDelete(message.id); onClose(); }}
            className="w-full flex items-center px-4 py-2 hover:bg-red-50 text-red-600 transition-colors"
          >
            <Trash2 size={16} className="mr-3 text-red-500" />
            Delete
          </button>
        </>
      )}
    </div>
  );
};
