import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { notificationService } from '../services/notification.service';
import { useNotificationStore } from '../store/useNotificationStore';

interface NotificationBellProps {
  className?: string;
}

export const NotificationBell = ({ className }: NotificationBellProps) => {
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const isOpen = useNotificationStore((state) => state.isOpen);
  const setUnreadCount = useNotificationStore((state) => state.setUnreadCount);
  const setDrawerOpen = useNotificationStore((state) => state.setDrawerOpen);
  const { data } = useQuery({
    queryKey: ['notifications', 'unreadCount'],
    queryFn: () => notificationService.getUnreadCount(),
  });

  useEffect(() => {
    if (data) setUnreadCount(data.unreadCount);
  }, [data, setUnreadCount]);

  return (
    <button
      type="button"
      onClick={() => setDrawerOpen(true)}
      className={`relative p-2 hover:bg-neutral-100 rounded-lg text-neutral-600 transition-colors ${className ?? ''}`}
      aria-label="Open notifications"
      aria-expanded={isOpen}
    >
      <Bell size={20} />
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 min-w-5 h-5 px-1 rounded-full bg-danger text-white text-[11px] font-semibold flex items-center justify-center">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};
