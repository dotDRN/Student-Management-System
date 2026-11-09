import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Smile, Loader2 } from 'lucide-react';
import { useChatStore } from '../../../store/useChatStore';
import { socketService } from '../../../services/socket.service';
import { chatService } from '../../../services/chat.service';
import type { MessageType, SendMessageDto, UploadedAttachmentDto } from '../../../types/chat';
import { ReplyPreview } from './ReplyPreview';
import { AttachmentPreview } from './AttachmentPreview';
import type { PendingAttachment } from './AttachmentPreview';
import { cn } from '../../ui/Button';

interface ComposerProps {
  conversationId: string;
  onOptimisticSend?: (tempId: string, content: string, attachments: any[], type?: MessageType) => void;
  onOptimisticSuccess?: (tempId: string, realMessage: any) => void;
  onOptimisticError?: (tempId: string) => void;
  onEditSuccess?: (messageId: string, newContent: string) => void;
}

const COMMON_EMOJIS = [
  '😊', '😂', '❤️', '👍', '🎉', '🔥', '🙏', '👏',
  '😍', '🤔', '😎', '😢', '😮', '💯', '✅', '🚀',
  '👋', '🙌', '⭐', '💡', '📚', '🎓', '✏️', '📅',
];

export const Composer: React.FC<ComposerProps> = ({
  conversationId,
  onOptimisticSend,
  onOptimisticSuccess,
  onOptimisticError,
  onEditSuccess,
}) => {
  const [content, setContent] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadPromisesRef = useRef<Map<string, Promise<UploadedAttachmentDto | null>>>(new Map());

  const { replyingToMessage, setReplyingToMessage, editingMessage, setEditingMessage } = useChatStore();

  useEffect(() => {
    if (editingMessage) {
      setContent(editingMessage.content ?? '');
      textareaRef.current?.focus();
    } else {
      setContent('');
    }
  }, [editingMessage]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  const adjustTextareaHeight = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
    }
  };

  const startFileUpload = (pending: PendingAttachment): Promise<UploadedAttachmentDto | null> => {
    const promise = chatService
      .uploadAttachment(pending.file, (percent) => {
        setAttachments((prev) =>
          prev.map((a) => (a.id === pending.id ? { ...a, progress: percent } : a)),
        );
      })
      .then((uploaded) => {
        const normalized: UploadedAttachmentDto = {
          id: uploaded.id,
          url: uploaded.url,
          fileName: uploaded.fileName || pending.file.name,
          mimeType: uploaded.mimeType || pending.file.type || 'application/octet-stream',
          fileSize: uploaded.fileSize || pending.file.size,
        };
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === pending.id
              ? { ...a, progress: 100, status: 'done', uploaded: normalized, error: undefined }
              : a,
          ),
        );
        return normalized;
      })
      .catch((err) => {
        console.error('Failed to upload attachment to Cloudinary:', err);
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === pending.id
              ? {
                  ...a,
                  status: 'error',
                  error: err?.response?.data?.message || 'Upload failed',
                }
              : a,
          ),
        );
        return null;
      })
      .finally(() => {
        uploadPromisesRef.current.delete(pending.id);
      });

    uploadPromisesRef.current.set(pending.id, promise);
    return promise;
  };

  const enqueueFiles = (files: File[]) => {
    if (files.length === 0) return;

    const newPending: PendingAttachment[] = files.map((file) => ({
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      progress: 0,
      status: 'uploading',
    }));

    setAttachments((prev) => [...prev, ...newPending]);
    newPending.forEach((item) => {
      void startFileUpload(item);
    });
  };

  const handleRetryUpload = (id: string) => {
    const target = attachments.find((a) => a.id === id);
    if (!target) return;
    setAttachments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'uploading', progress: 0, error: undefined } : a)),
    );
    void startFileUpload(target);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
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

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
      e.preventDefault();
      enqueueFiles(Array.from(e.clipboardData.files));
    }
  };

  const inferMessageType = (atts: UploadedAttachmentDto[]): MessageType => {
    if (atts.length === 0) return 'text';
    if (atts.every((a) => a.mimeType.startsWith('image/'))) return 'image';
    if (atts.every((a) => a.mimeType.startsWith('audio/'))) return 'audio';
    return 'file';
  };

  const handleSend = async () => {
    if (isSending) return;
    const trimmedContent = content.trim();
    if (!trimmedContent && attachments.length === 0) return;

    if (editingMessage) {
      if (!trimmedContent) return;
      const editingId = editingMessage.id;
      setContent('');
      setEditingMessage(null);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      await chatService.editMessage(editingId, trimmedContent);
      if (onEditSuccess) onEditSuccess(editingId, trimmedContent);
      return;
    }

    // If any attachment failed and was not removed, retry or alert
    const hasFailed = attachments.some((a) => a.status === 'error');
    if (hasFailed) {
      return;
    }

    setIsSending(true);

    try {
      // Wait for any in-flight uploads to finish
      const currentAttachments = [...attachments];
      const uploadedAttachments: UploadedAttachmentDto[] = [];

      for (const att of currentAttachments) {
        if (att.uploaded) {
          uploadedAttachments.push({
            url: att.uploaded.url,
            fileName: att.uploaded.fileName,
            mimeType: att.uploaded.mimeType,
            fileSize: att.uploaded.fileSize,
          });
        } else {
          const pendingPromise = uploadPromisesRef.current.get(att.id) || startFileUpload(att);
          const result = await pendingPromise;
          if (!result) {
            setIsSending(false);
            return;
          }
          uploadedAttachments.push({
            url: result.url,
            fileName: result.fileName,
            mimeType: result.mimeType,
            fileSize: result.fileSize,
          });
        }
      }

      const tempId = `temp_${Date.now()}`;
      const msgType = inferMessageType(uploadedAttachments);
      const payload: SendMessageDto = {
        content: trimmedContent || undefined,
        type: msgType,
        ...(replyingToMessage ? { replyToId: replyingToMessage.id } : {}),
        ...(uploadedAttachments.length > 0 ? { attachments: uploadedAttachments } : {}),
      };

      // Clear composer UI immediately
      setContent('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      setAttachments([]);
      setReplyingToMessage(null);
      setIsTyping(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      socketService.emit('typing:stop', { conversationId });

      if (onOptimisticSend) {
        onOptimisticSend(tempId, trimmedContent, currentAttachments, msgType);
      }

      try {
        const realMessage = await chatService.sendMessage(conversationId, payload);
        if (onOptimisticSuccess) {
          onOptimisticSuccess(tempId, realMessage);
        }
      } catch (error) {
        console.error('Failed to send message:', error);
        if (onOptimisticError) {
          onOptimisticError(tempId);
        }
      } finally {
        currentAttachments.forEach((a) => {
          if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
        });
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      enqueueFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att && att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
    uploadPromisesRef.current.delete(id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      enqueueFiles(Array.from(e.dataTransfer.files));
    }
  };

  const isUploadingAny = attachments.some((a) => a.status === 'uploading');
  const hasErrorAny = attachments.some((a) => a.status === 'error');
  const canSend =
    !isSending &&
    !hasErrorAny &&
    (Boolean(content.trim()) || attachments.length > 0);

  return (
    <div
      className="flex flex-col bg-white border-t border-neutral-200 shrink-0 relative"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {replyingToMessage && (
        <ReplyPreview message={replyingToMessage} onCancel={() => setReplyingToMessage(null)} />
      )}

      <AttachmentPreview
        attachments={attachments}
        onRemove={removeAttachment}
        onRetry={handleRetryUpload}
      />

      {/* Emoji Popover */}
      {showEmojiPicker && (
        <div
          ref={emojiPickerRef}
          className="absolute bottom-16 right-14 z-40 w-64 bg-white border border-neutral-200 rounded-2xl shadow-xl p-3 grid grid-cols-6 gap-1.5"
        >
          {COMMON_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                setContent((prev) => prev + emoji);
                textareaRef.current?.focus();
              }}
              className="w-8 h-8 flex items-center justify-center text-lg hover:bg-neutral-100 rounded-lg transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end p-3 gap-2">
        <label
          className="p-2.5 text-neutral-500 hover:text-brand-600 hover:bg-brand-50 rounded-full cursor-pointer transition-colors shrink-0"
          title="Attach image, video, audio, or document"
        >
          <Paperclip size={20} />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
            className="hidden"
            onChange={handleFileSelect}
          />
        </label>

        <div className="flex-1 min-w-0 bg-neutral-100 rounded-2xl flex items-end overflow-hidden border border-transparent focus-within:border-brand-300 focus-within:bg-white transition-colors">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              editingMessage
                ? 'Edit message...'
                : attachments.length > 0
                  ? 'Add a caption...'
                  : 'Type a message...'
            }
            className="w-full bg-transparent max-h-[150px] min-h-[40px] py-2.5 px-4 outline-none resize-none text-neutral-800 text-sm"
            rows={1}
          />
          <button
            type="button"
            onClick={() => setShowEmojiPicker((prev) => !prev)}
            className={cn(
              'p-2 mb-1 mr-1 rounded-full transition-colors shrink-0',
              showEmojiPicker
                ? 'text-brand-600 bg-brand-50'
                : 'text-neutral-400 hover:text-neutral-600',
            )}
            title="Insert emoji"
          >
            <Smile size={20} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!canSend}
          className={cn(
            'p-3 rounded-full flex items-center justify-center shrink-0 transition-all',
            canSend
              ? 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm hover:shadow'
              : 'bg-neutral-100 text-neutral-400 cursor-not-allowed',
          )}
          title={isUploadingAny ? 'Sending once upload completes...' : 'Send message'}
        >
          {isSending || isUploadingAny ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Send size={18} className={canSend ? 'ml-0.5' : ''} />
          )}
        </button>
      </div>
    </div>
  );
};
