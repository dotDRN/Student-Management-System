import React, { useState } from 'react';
import { format } from 'date-fns';
import { MoreHorizontal, Check, CheckCheck, Clock } from 'lucide-react';
import type { Message } from '../../../types/chat';
import { useAuthStore } from '../../../store/useAuthStore';
import { MessageMenu } from '../ContextMenus/MessageMenu';
import { ReactionBar } from '../Panels/ReactionBar';
import { cn } from '../../ui/Button';
import { useQueryClient } from '@tanstack/react-query';
import { useChatStore } from '../../../store/useChatStore';

interface MessageBubbleProps {
  message: Message;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onReact: (messageId: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({
  message, onReply, onEdit, onDelete, onReact
}) => {
  const currentUserId = useAuthStore((state) => state.currentUser?.id);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const queryClient = useQueryClient();
  const isSender = message.senderId === currentUserId;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

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
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({ x: rect.right + 8, y: rect.top });
    setMenuOpen(true);
  };

  const renderStatus = () => {
    if (!isSender) return null;
    switch (message.status) {
      case 'SENDING': return <Clock size={12} className="text-neutral-400" />;
      case 'SENT': return <Check size={12} className="text-neutral-400" />;
      case 'DELIVERED': return <CheckCheck size={12} className="text-neutral-400" />;
      case 'READ': return <CheckCheck size={12} className="text-brand-500" />;
      default: return null;
    }
  };

  return (
    <div className={cn("flex w-full mb-4 group", isSender ? "justify-end" : "justify-start")}>
      {!isSender && (
        <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-xs mr-2 shrink-0 select-none">
          {message.sender?.fullName?.charAt(0) || 'U'}
        </div>
      )}

      <div className={cn("flex flex-col max-w-[70%]", isSender ? "items-end" : "items-start")}>
        {!isSender && (
          <span className="text-xs text-neutral-500 mb-1 ml-1">
            {message.sender?.fullName}
          </span>
        )}

        <div className={cn("flex items-center gap-2", isSender ? "flex-row-reverse" : "flex-row")}>
          <div 
            onContextMenu={handleContextMenu}
            className={cn(
              "px-4 py-2 rounded-2xl relative shadow-sm",
              isSender 
                ? "bg-brand-600 text-white rounded-tr-sm" 
                : "bg-white border border-neutral-200 text-neutral-800 rounded-tl-sm"
            )}
          >
            {/* Render Reply Target */}
            {message.replyToId && (
              <div 
                className={cn(
                  "text-xs mb-2 pl-2.5 py-1 border-l-2 rounded-r-sm opacity-90 cursor-pointer transition-colors",
                  isSender 
                    ? "border-white/70 bg-black/10 hover:bg-black/20" 
                    : "border-brand-500 bg-brand-50 hover:bg-brand-100 text-brand-900"
                )}
                onClick={() => {
                  // Optional: scroll to message logic can go here in the future
                }}
              >
                <div className="font-semibold mb-0.5">
                  {repliedMessage ? repliedMessage.sender?.fullName : 'Loading...'}
                </div>
                <div className="line-clamp-1 opacity-80">
                  {repliedMessage ? (repliedMessage.content || 'Attachment') : 'Replying to message...'}
                </div>
              </div>
            )}

            {/* Attachments Placeholder */}
            {message.attachments?.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {message.attachments.map(att => (
                  <div key={att.id} className="w-full sm:w-48 bg-black/10 rounded overflow-hidden">
                    {att.mimeType.startsWith('image') ? (
                      <img src={att.url} alt="attachment" className="w-full h-auto object-cover" />
                    ) : (
                      <div className="p-2 text-xs truncate flex items-center gap-1">
                        <span className="underline">{att.fileName}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {message.content}
            </p>
            
            <div className={cn(
              "flex items-center justify-end gap-1 mt-1 text-[10px]",
              isSender ? "text-white/70" : "text-neutral-400"
            )}>
              {message.isEdited && <span>(edited)</span>}
              <span>{format(new Date(message.createdAt), 'HH:mm')}</span>
              {renderStatus()}
            </div>
          </div>

          <button
            onClick={handleOptionsClick}
            className="p-1 rounded-full text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 opacity-0 group-hover:opacity-100 transition-all shrink-0"
          >
            <MoreHorizontal size={16} />
          </button>
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
        onReact={onReact}
      />
    </div>
  );
});
