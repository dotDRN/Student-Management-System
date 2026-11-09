import React, { useState } from 'react';
import { format } from 'date-fns';
import {
  MoreHorizontal,
  Check,
  CheckCheck,
  Clock,
  SmilePlus,
  FileText,
  Download,
  X,
  ExternalLink,
} from 'lucide-react';
import type { Attachment, Conversation, Message } from '../../../types/chat';
import { useAuthStore } from '../../../store/useAuthStore';
import { useChatStore } from '../../../store/useChatStore';
import { MessageMenu } from '../ContextMenus/MessageMenu';
import { ReactionBar } from '../Panels/ReactionBar';
import { ReactionPicker } from '../ContextMenus/ReactionPicker';
import { cn } from '../../ui/Button';
import { useQueryClient } from '@tanstack/react-query';
import { chatService } from '../../../services/chat.service';

interface MessageBubbleProps {
  message: Message;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (messageId: string) => void;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(
  ({ message, onReply, onEdit, onDelete }) => {
    const currentUserId = useAuthStore((state) => state.currentUser?.id);
    const activeConversationId = useChatStore((state) => state.activeConversationId);
    const queryClient = useQueryClient();
    const isSender = message.senderId === currentUserId;

    const [menuOpen, setMenuOpen] = useState(false);
    const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerPos, setPickerPos] = useState({ x: 0, y: 0 });

    const [lightboxAttachment, setLightboxAttachment] = useState<Attachment | null>(null);

    // Locate the replied message in cache
    let repliedMessage: Message | undefined;
    if (message.replyToId && activeConversationId) {
      const messagesData = queryClient.getQueryData<any>(['messages', activeConversationId]);
      if (messagesData?.pages) {
        for (const page of messagesData.pages) {
          repliedMessage = page.find((m: Message) => m.id === message.replyToId);
          if (repliedMessage) break;
        }
      }
    }

    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      setMenuPos({ x: e.clientX, y: e.clientY });
      setMenuOpen(true);
    };

    const handleOptionsClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      setMenuPos({
        x: isSender ? rect.left : rect.right + 4,
        y: rect.bottom + 4,
      });
      setMenuOpen((prev) => !prev);
    };

    const handleQuickReactClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      setPickerPos({ x: rect.left + rect.width / 2, y: rect.top });
      setPickerOpen((prev) => !prev);
    };

    const handleSelectReaction = async (reactionType: string) => {
      if (!activeConversationId || !currentUserId) return;

      const hasReacted = message.reactions?.some(
        (r) => r.userId === currentUserId && r.reaction === reactionType,
      );
      if (hasReacted) return;

      const previousMessages = queryClient.getQueryData(['messages', activeConversationId]);

      queryClient.setQueryData(['messages', activeConversationId], (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: Message[]) =>
            page.map((m) => {
              if (m.id === message.id) {
                const newReactions = [
                  ...(m.reactions || []),
                  {
                    id: `temp-${Date.now()}`,
                    messageId: message.id,
                    userId: currentUserId,
                    reaction: reactionType as any,
                    createdAt: new Date().toISOString(),
                  },
                ];
                return { ...m, reactions: newReactions };
              }
              return m;
            }),
          ),
        };
      });

      try {
        await chatService.addReaction(message.id, reactionType);
      } catch (error) {
        console.error('Failed to add reaction:', error);
        queryClient.setQueryData(['messages', activeConversationId], previousMessages);
      }
    };

    const renderStatus = () => {
      if (!isSender) return null;

      if (message.status === 'sending') {
        return <Clock size={12} className="text-white/70" />;
      }

      const conversation = activeConversationId
        ? queryClient.getQueryData<Conversation>(['conversation', activeConversationId]) ||
          queryClient
            .getQueryData<Conversation[]>(['conversations'])
            ?.find((c) => c.id === activeConversationId)
        : undefined;

      const otherMembers =
        conversation?.members?.filter((m) => m.userId !== currentUserId) || [];
      const isReadByOthers =
        message.status === 'read' ||
        (otherMembers.length > 0 &&
          otherMembers.some(
            (m) =>
              m.lastReadAt &&
              new Date(m.lastReadAt).getTime() >= new Date(message.createdAt).getTime(),
          ));

      if (isReadByOthers) {
        return <CheckCheck size={12} className="text-sky-200" />;
      }
      if (message.status === 'delivered') {
        return <CheckCheck size={12} className="text-white/70" />;
      }
      return <Check size={12} className="text-white/70" />;
    };

    const renderAttachment = (att: Attachment) => {
      const mime = att.mimeType || '';
      const isImage = mime.startsWith('image/');
      const isVideo = mime.startsWith('video/');
      const isAudio = mime.startsWith('audio/');

      if (isImage) {
        return (
          <div
            key={att.id}
            className="relative group/att rounded-xl overflow-hidden bg-black/10 max-w-[260px] sm:max-w-[320px]"
          >
            <img
              src={att.url}
              alt={att.fileName || 'Attachment'}
              onClick={() => setLightboxAttachment(att)}
              className="w-full max-h-64 object-cover cursor-pointer hover:opacity-95 transition-opacity"
              loading="lazy"
            />
            <a
              href={att.url}
              target="_blank"
              rel="noopener noreferrer"
              download={att.fileName}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover/att:opacity-100 transition-opacity hover:bg-black/80"
              title="Open / Download image"
            >
              <Download size={14} />
            </a>
          </div>
        );
      }

      if (isVideo) {
        return (
          <div
            key={att.id}
            className="rounded-xl overflow-hidden bg-black max-w-[260px] sm:max-w-[320px]"
          >
            <video
              controls
              preload="metadata"
              src={att.url}
              className="w-full max-h-64"
            />
          </div>
        );
      }

      if (isAudio) {
        return (
          <div
            key={att.id}
            className={cn(
              'p-2 rounded-xl flex flex-col gap-1 min-w-[220px] max-w-[280px]',
              isSender ? 'bg-black/15' : 'bg-neutral-100',
            )}
          >
            <span className="text-xs font-medium truncate px-1">{att.fileName}</span>
            <audio controls src={att.url} className="w-full h-9" />
          </div>
        );
      }

      return (
        <a
          key={att.id}
          href={att.url}
          target="_blank"
          rel="noopener noreferrer"
          download={att.fileName}
          className={cn(
            'flex items-center gap-3 p-2.5 rounded-xl border transition-colors max-w-[260px] sm:max-w-[300px]',
            isSender
              ? 'bg-white/15 border-white/20 hover:bg-white/25 text-white'
              : 'bg-neutral-50 border-neutral-200 hover:bg-neutral-100 text-neutral-800',
          )}
        >
          <div
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
              isSender ? 'bg-white/20 text-white' : 'bg-brand-50 text-brand-600',
            )}
          >
            <FileText size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate" title={att.fileName}>
              {att.fileName}
            </p>
            {att.fileSize > 0 && (
              <p
                className={cn(
                  'text-[10px]',
                  isSender ? 'text-white/75' : 'text-neutral-500',
                )}
              >
                {formatFileSize(att.fileSize)}
              </p>
            )}
          </div>
          <Download
            size={15}
            className={cn('shrink-0', isSender ? 'text-white/80' : 'text-neutral-500')}
          />
        </a>
      );
    };

    return (
      <div
        className={cn(
          'flex w-full mb-4 group',
          isSender ? 'justify-end' : 'justify-start',
        )}
      >
        {!isSender && (
          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-xs mr-2 shrink-0 select-none">
            {message.sender?.fullName?.charAt(0) || 'U'}
          </div>
        )}

        <div
          className={cn(
            'flex flex-col max-w-[78%] sm:max-w-[70%] min-w-0',
            isSender ? 'items-end' : 'items-start',
          )}
        >
          {!isSender && (
            <span className="text-xs text-neutral-500 mb-1 ml-1 truncate max-w-full">
              {message.sender?.fullName}
            </span>
          )}

          <div
            className={cn(
              'flex items-center gap-1.5 max-w-full min-w-0',
              isSender ? 'flex-row-reverse' : 'flex-row',
            )}
          >
            <div
              onContextMenu={handleContextMenu}
              className={cn(
                'px-3.5 py-2.5 rounded-2xl relative shadow-sm min-w-0 max-w-full',
                isSender
                  ? 'bg-brand-600 text-white rounded-tr-sm'
                  : 'bg-white border border-neutral-200 text-neutral-800 rounded-tl-sm',
              )}
            >
              {/* Render Reply Target */}
              {message.replyToId && (
                <div
                  className={cn(
                    'text-xs mb-2.5 px-3 py-2 border-l-4 rounded-md opacity-90 cursor-pointer transition-colors flex flex-col',
                    isSender
                      ? 'border-white/40 bg-black/10 hover:bg-black/20 text-white/95'
                      : 'border-brand-500 bg-brand-50 hover:bg-brand-100 text-neutral-800',
                  )}
                >
                  <div className="font-semibold mb-0.5 truncate">
                    {repliedMessage ? repliedMessage.sender?.fullName : 'Original Message'}
                  </div>
                  <div className="line-clamp-1 opacity-80">
                    {repliedMessage
                      ? repliedMessage.content || '📎 Attachment'
                      : 'Replying to message...'}
                  </div>
                </div>
              )}

              {/* Attachments */}
              {!message.isDeleted && message.attachments?.length > 0 && (
                <div className="flex flex-col gap-2 mb-1.5">
                  {message.attachments.map((att) => renderAttachment(att))}
                </div>
              )}

              {message.content && (
                <p
                  className={cn(
                    'whitespace-pre-wrap break-words text-sm leading-relaxed',
                    message.isDeleted && 'italic opacity-75',
                  )}
                >
                  {message.content}
                </p>
              )}

              <div
                className={cn(
                  'flex items-center justify-end gap-1 mt-1 text-[10px]',
                  isSender ? 'text-white/70' : 'text-neutral-400',
                )}
              >
                {message.isEdited && !message.isDeleted && <span>(edited)</span>}
                <span>{format(new Date(message.createdAt), 'HH:mm')}</span>
                {renderStatus()}
              </div>
            </div>

            {!message.isDeleted && (
              <div
                className={cn(
                  'flex items-center transition-opacity shrink-0',
                  menuOpen || pickerOpen
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100',
                )}
              >
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={handleQuickReactClick}
                  className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/70 transition-colors"
                  title="React"
                >
                  <SmilePlus size={16} />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={handleOptionsClick}
                  className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/70 transition-colors"
                  title="More options"
                >
                  <MoreHorizontal size={16} />
                </button>
              </div>
            )}
          </div>

          <ReactionBar messageId={message.id} reactions={message.reactions || []} />
        </div>

        <MessageMenu
          message={message}
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          position={menuPos}
          onReply={onReply}
          onEdit={onEdit}
          onDelete={onDelete}
          onReact={() => {
            setPickerPos(menuPos);
            setPickerOpen(true);
          }}
        />

        <ReactionPicker
          isOpen={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={handleSelectReaction}
          position={pickerPos}
        />

        {/* Fullscreen Image Lightbox */}
        {lightboxAttachment && (
          <div
            className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4"
            onClick={() => setLightboxAttachment(null)}
          >
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <a
                href={lightboxAttachment.url}
                target="_blank"
                rel="noopener noreferrer"
                download={lightboxAttachment.fileName}
                onClick={(e) => e.stopPropagation()}
                className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
                title="Open in new tab / Download"
              >
                <ExternalLink size={20} />
              </a>
              <button
                type="button"
                onClick={() => setLightboxAttachment(null)}
                className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
                title="Close preview"
              >
                <X size={20} />
              </button>
            </div>
            <img
              src={lightboxAttachment.url}
              alt={lightboxAttachment.fileName}
              onClick={(e) => e.stopPropagation()}
              className="max-w-[92vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
            {lightboxAttachment.fileName && (
              <p className="mt-3 text-sm text-white/80 font-medium">
                {lightboxAttachment.fileName}
              </p>
            )}
          </div>
        )}
      </div>
    );
  },
);
