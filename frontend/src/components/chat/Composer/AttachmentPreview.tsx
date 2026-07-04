import React from 'react';
import { X, FileText, Image as ImageIcon } from 'lucide-react';

export interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string | null;
  progress: number;
}

interface AttachmentPreviewProps {
  attachments: PendingAttachment[];
  onRemove: (id: string) => void;
}

export const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({ attachments, onRemove }) => {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3 p-3 bg-white border-b border-neutral-100">
      {attachments.map((att) => {
        const isImage = att.file.type.startsWith('image/');
        
        return (
          <div key={att.id} className="relative group w-20 h-20 rounded-lg border border-neutral-200 overflow-hidden bg-neutral-50 flex items-center justify-center shadow-sm">
            {isImage && att.previewUrl ? (
              <img src={att.previewUrl} alt={att.file.name} className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center text-neutral-400">
                <FileText size={24} />
                <span className="text-[10px] truncate w-full px-1 text-center mt-1">{att.file.name}</span>
              </div>
            )}
            
            <button
              onClick={() => onRemove(att.id)}
              className="absolute top-1 right-1 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={12} />
            </button>

            {att.progress < 100 && (
              <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center">
                <div className="w-3/4 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-brand-500 transition-all duration-200 ease-out" 
                    style={{ width: `${att.progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
