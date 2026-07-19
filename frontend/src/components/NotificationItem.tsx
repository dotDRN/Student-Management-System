import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { Notification } from '../types/notification';

interface NotificationItemProps {
  notification: Notification;
  onClick: (notification: Notification) => void;
}

export const NotificationItem: React.FC<NotificationItemProps> = ({ notification, onClick }) => {
  return (
    <button
      type="button"
      onClick={() => onClick(notification)}
      className="w-full text-left px-5 py-4 border-b border-neutral-100 hover:bg-neutral-50 transition-colors"
    >
      <div className="flex items-start gap-3">
        <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${notification.isRead ? 'bg-transparent' : 'bg-primary'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium text-sm text-neutral-900">{notification.title}</p>
            <time className="shrink-0 text-xs text-neutral-400">
              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
            </time>
          </div>
          <p className="mt-1 text-sm text-neutral-600 line-clamp-2">{notification.body}</p>
        </div>
      </div>
    </button>
  );
};
