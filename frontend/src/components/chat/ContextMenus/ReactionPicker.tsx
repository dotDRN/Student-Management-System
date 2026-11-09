import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';

interface ReactionPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (reaction: string) => void;
  position: { x: number; y: number };
}

const REACTIONS = [
  { type: 'like', emoji: '👍' },
  { type: 'love', emoji: '❤️' },
  { type: 'laugh', emoji: '😂' },
  { type: 'wow', emoji: '😮' },
  { type: 'sad', emoji: '😢' },
  { type: 'angry', emoji: '😡' },
];

export const ReactionPicker: React.FC<ReactionPickerProps> = ({
  isOpen,
  onClose,
  onSelect,
  position,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({
    top: position.y,
    left: position.x,
  });

  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;

    let left = position.x - rect.width / 2;
    left = Math.max(margin, Math.min(left, vw - rect.width - margin));

    let top = position.y - rect.height - 8;
    if (top < margin) {
      top = Math.min(position.y + 12, vh - rect.height - margin);
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

  return (
    <div
      ref={menuRef}
      className="fixed z-50 flex items-center gap-1 p-1.5 bg-white border border-neutral-200 rounded-full shadow-xl"
      style={{ top: coords.top, left: coords.left }}
    >
      {REACTIONS.map(({ type, emoji }) => (
        <button
          key={type}
          type="button"
          onClick={() => {
            onSelect(type);
            onClose();
          }}
          className="w-8 h-8 flex items-center justify-center text-xl hover:bg-neutral-100 hover:scale-110 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};
