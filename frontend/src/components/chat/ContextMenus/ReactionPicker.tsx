import React, { useRef, useEffect } from 'react';
import { cn } from '../../ui/Button';

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
];

export const ReactionPicker: React.FC<ReactionPickerProps> = ({
  isOpen,
  onClose,
  onSelect,
  position
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={menuRef}
      className="fixed z-50 flex items-center gap-1 p-1 bg-white border border-neutral-200 rounded-full shadow-lg"
      style={{ top: position.y, left: position.x, transform: 'translate(-50%, -100%)', marginTop: '-8px' }}
    >
      {REACTIONS.map(({ type, emoji }) => (
        <button
          key={type}
          onClick={() => {
            onSelect(type);
            onClose();
          }}
          className="w-8 h-8 flex items-center justify-center text-xl hover:bg-neutral-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};
