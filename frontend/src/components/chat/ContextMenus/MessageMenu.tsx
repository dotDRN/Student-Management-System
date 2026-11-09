import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { Reply, Edit2, Trash2, Copy, SmilePlus, Download } from 'lucide-react';
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
  position,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const currentUserId = useAuthStore((state) => state.currentUser?.id);
  const [coords, setCoords] = useState<{ top: number; left: number }>({
    top: position.y,
    left: position.x,
  });

  const isSender = message.senderId === currentUserId;

  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;

    let left = position.x;
    if (left + rect.width + margin > vw) {
      left = position.x - rect.width - 8;
    }
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

    const handleScrollOrResize = () => {
      onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (message.content) {
      void navigator.clipboard.writeText(message.content);
    }
    onClose();
  };

  const firstAttachment = message.attachments?.[0];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-48 max-h-[calc(100vh-24px)] overflow-y-auto bg-white border border-neutral-200 rounded-xl shadow-xl py-1.5 text-sm font-medium text-neutral-700"
      style={{ top: coords.top, left: coords.left }}
    >
      <button
        type="button"
        onClick={() => {
          onReply(message);
          onClose();
        }}
        className="w-full flex items-center px-4 py-2 hover:bg-neutral-50 transition-colors"
      >
        <Reply size={16} className="mr-3 text-neutral-500 shrink-0" />
        Reply
      </button>

      <button
        type="button"
        onClick={() => {
          onReact(message.id);
          onClose();
        }}
        className="w-full flex items-center px-4 py-2 hover:bg-neutral-50 transition-colors"
      >
        <SmilePlus size={16} className="mr-3 text-neutral-500 shrink-0" />
        React
      </button>

      {message.content && !message.isDeleted && (
        <button
          type="button"
          onClick={handleCopy}
          className="w-full flex items-center px-4 py-2 hover:bg-neutral-50 transition-colors"
        >
          <Copy size={16} className="mr-3 text-neutral-500 shrink-0" />
          Copy Text
        </button>
      )}

      {firstAttachment && !message.isDeleted && (
        <a
          href={firstAttachment.url}
          target="_blank"
          rel="noopener noreferrer"
          download={firstAttachment.fileName}
          onClick={() => onClose()}
          className="w-full flex items-center px-4 py-2 hover:bg-neutral-50 transition-colors"
        >
          <Download size={16} className="mr-3 text-neutral-500 shrink-0" />
          Download File
        </a>
      )}

      {isSender && !message.isDeleted && (
        <>
          <button
            type="button"
            onClick={() => {
              onEdit(message);
              onClose();
            }}
            className="w-full flex items-center px-4 py-2 hover:bg-neutral-50 transition-colors"
          >
            <Edit2 size={16} className="mr-3 text-neutral-500 shrink-0" />
            Edit
          </button>

          <div className="h-px bg-neutral-200 my-1 mx-2" />

          <button
            type="button"
            onClick={() => {
              onDelete(message.id);
              onClose();
            }}
            className="w-full flex items-center px-4 py-2 hover:bg-red-50 text-red-600 transition-colors"
          >
            <Trash2 size={16} className="mr-3 text-red-500 shrink-0" />
            Delete
          </button>
        </>
      )}
    </div>
  );
};
