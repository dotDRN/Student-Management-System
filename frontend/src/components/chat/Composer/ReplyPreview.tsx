import React from 'react';
import { X, Reply } from 'lucide-react';
import type { Message } from '../../../types/chat';

interface ReplyPreviewProps {
  message: Message;
  onCancel: () => void;
}

export const ReplyPreview: React.FC<ReplyPreviewProps> = ({ message, onCancel }) => {
  return (
    <div className="flex items-center justify-between bg-neutral-50 px-4 py-2 border-l-4 border-brand-500 text-sm">
      <div className="flex flex-col overflow-hidden">
        <div className="flex items-center text-brand-600 font-medium mb-0.5">
          <Reply size={14} className="mr-1.5" />
          Replying to {message.sender?.profile?.firstName || 'User'}
        </div>
        <p className="text-neutral-600 truncate">{message.content}</p>
      </div>
      <button 
        onClick={onCancel}
        className="p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-200 transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
};
