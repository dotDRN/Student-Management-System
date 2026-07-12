import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Smile } from 'lucide-react';
import { useChatStore } from '../../../store/useChatStore';
import { socketService } from '../../../services/socket.service';
import { chatService } from '../../../services/chat.service';
import { ReplyPreview } from './ReplyPreview';
import { AttachmentPreview } from './AttachmentPreview';
import type { PendingAttachment } from './AttachmentPreview';
import { cn } from '../../ui/Button';

interface ComposerProps {
  conversationId: string;
  onOptimisticSend?: (tempId: string, content: string, attachments: any[]) => void;
  onOptimisticSuccess?: (tempId: string, realMessage: any) => void;
  onOptimisticError?: (tempId: string) => void;
  onEditSuccess?: (messageId: string, newContent: string) => void;
}

export const Composer: React.FC<ComposerProps> = ({ 
  conversationId, 
  onOptimisticSend,
  onOptimisticSuccess,
  onOptimisticError,
  onEditSuccess
}) => {
  const [content, setContent] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { replyingToMessage, setReplyingToMessage, editingMessage, setEditingMessage } = useChatStore();

  useEffect(() => {
    if (editingMessage) {
      setContent(editingMessage.content);
      textareaRef.current?.focus();
    } else {
      setContent('');
    }
  }, [editingMessage]);

  const adjustTextareaHeight = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    adjustTextareaHeight();

    if (!isTyping) {
      setIsTyping(true);
      socketService.emit('typing:start', { conversationId });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socketService.emit('typing:stop', { conversationId });
    }, 1500);
  };

  const handleSend = async () => {
    if (!content.trim() && attachments.length === 0) return;

    const tempId = `temp_${Date.now()}`;
    const payload: any = {
      content: content.trim(),
    };
    if (replyingToMessage) {
      payload.replyToId = replyingToMessage.id;
    }

    if (editingMessage) {
      // Edit mode
      const newContent = content.trim();
      const editingId = editingMessage.id;
      setContent('');
      setEditingMessage(null);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      await chatService.editMessage(editingId, newContent);
      if (onEditSuccess) onEditSuccess(editingId, newContent);
      return;
    }

    // Clear UI immediately
    setContent('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    const currentAttachments = [...attachments];
    setAttachments([]);
    setReplyingToMessage(null);
    setIsTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socketService.emit('typing:stop', { conversationId });

    if (onOptimisticSend) {
      onOptimisticSend(tempId, payload.content, currentAttachments);
    }

    try {
      // Upload attachments sequentially or in parallel here if needed
      // Assuming straightforward text send for now + standard API logic
      const realMessage = await chatService.sendMessage(conversationId, payload);
      if (onOptimisticSuccess) {
        onOptimisticSuccess(tempId, realMessage);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      if (onOptimisticError) {
        onOptimisticError(tempId);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      const newPending = files.map(file => ({
        id: `att_${Date.now()}_${Math.random()}`,
        file,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        progress: 0,
      }));
      setAttachments(prev => [...prev, ...newPending]);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => {
      const att = prev.find(a => a.id === id);
      if (att && att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      return prev.filter(a => a.id !== id);
    });
  };

  // Drag and drop listeners
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      const newPending = files.map(file => ({
        id: `att_${Date.now()}_${Math.random()}`,
        file,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        progress: 0,
      }));
      setAttachments(prev => [...prev, ...newPending]);
    }
  };

  return (
    <div 
      className="flex flex-col bg-white border-t border-neutral-200 shrink-0"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {replyingToMessage && (
        <ReplyPreview message={replyingToMessage} onCancel={() => setReplyingToMessage(null)} />
      )}
      
      <AttachmentPreview attachments={attachments} onRemove={removeAttachment} />

      <div className="flex items-end p-3 gap-2">
        <label className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-full cursor-pointer transition-colors shrink-0">
          <Paperclip size={20} />
          <input type="file" multiple className="hidden" onChange={handleFileSelect} />
        </label>
        
        <div className="flex-1 bg-neutral-100 rounded-2xl flex items-end overflow-hidden border border-transparent focus-within:border-brand-300 focus-within:bg-white transition-colors">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={editingMessage ? "Edit message..." : "Type a message..."}
            className="w-full bg-transparent max-h-[150px] min-h-[40px] py-2.5 px-4 outline-none resize-none text-neutral-800 text-sm"
            rows={1}
          />
          <button className="p-2 mb-1 mr-1 text-neutral-400 hover:text-neutral-600 transition-colors shrink-0">
            <Smile size={20} />
          </button>
        </div>

        <button
          onClick={handleSend}
          disabled={!content.trim() && attachments.length === 0}
          className={cn(
            "p-3 rounded-full flex items-center justify-center shrink-0 transition-all",
            (content.trim() || attachments.length > 0) 
              ? "bg-brand-600 text-white hover:bg-brand-700 shadow-sm hover:shadow" 
              : "bg-neutral-100 text-neutral-400 cursor-not-allowed"
          )}
        >
          <Send size={18} className={(content.trim() || attachments.length > 0) ? "ml-0.5" : ""} />
        </button>
      </div>
    </div>
  );
};
