import React from 'react';
import { X, FileText, Film, Music, AlertCircle, RotateCw, CheckCircle2 } from 'lucide-react';
import type { UploadedAttachmentDto } from '../../../types/chat';

export interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string | null;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  uploaded?: UploadedAttachmentDto;
  error?: string;
}

interface AttachmentPreviewProps {
  attachments: PendingAttachment[];
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({
  attachments,
  onRemove,
  onRetry,
}) => {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3 px-4 py-3 bg-neutral-50/80 border-b border-neutral-200 max-h-44 overflow-y-auto">
      {attachments.map((att) => {
        const mime = att.file.type || '';
        const isImage = mime.startsWith('image/');
        const isVideo = mime.startsWith('video/');
        const isAudio = mime.startsWith('audio/');

        return (
          <div
            key={att.id}
            className="relative group w-24 h-24 rounded-xl border border-neutral-200 overflow-hidden bg-white flex flex-col items-center justify-center shadow-sm shrink-0"
          >
            {isImage && att.previewUrl ? (
              <img
                src={att.previewUrl}
                alt={att.file.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-neutral-500 p-2 w-full h-full">
                {isVideo ? (
                  <Film size={24} className="text-brand-500 shrink-0" />
                ) : isAudio ? (
                  <Music size={24} className="text-brand-500 shrink-0" />
                ) : (
                  <FileText size={24} className="text-brand-500 shrink-0" />
                )}
                <span
                  className="text-[10px] font-medium text-neutral-700 truncate w-full text-center mt-1.5"
                  title={att.file.name}
                >
                  {att.file.name}
                </span>
                <span className="text-[9px] text-neutral-400">
                  {formatFileSize(att.file.size)}
                </span>
              </div>
            )}

            {/* Remove button */}
            <button
              type="button"
              onClick={() => onRemove(att.id)}
              className="absolute top-1 right-1 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-opacity"
              title="Remove attachment"
            >
              <X size={12} />
            </button>

            {/* Uploading overlay */}
            {att.status === 'uploading' && (
              <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center p-2">
                <div className="w-4/5 h-1.5 bg-white/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-400 transition-all duration-200 ease-out"
                    style={{ width: `${Math.max(10, att.progress)}%` }}
                  />
                </div>
                <span className="text-[10px] text-white font-medium mt-1">
                  {att.progress}%
                </span>
              </div>
            )}

            {/* Uploaded badge */}
            {att.status === 'done' && (
              <div
                className="absolute bottom-1 right-1 bg-emerald-500 text-white rounded-full p-0.5 shadow"
                title="Uploaded"
              >
                <CheckCircle2 size={12} />
              </div>
            )}

            {/* Error overlay */}
            {att.status === 'error' && (
              <div className="absolute inset-0 bg-red-900/70 flex flex-col items-center justify-center p-1 text-white text-center">
                <AlertCircle size={16} className="mb-1 text-red-200" />
                <span className="text-[9px] leading-tight line-clamp-2">
                  {att.error || 'Upload failed'}
                </span>
                {onRetry && (
                  <button
                    type="button"
                    onClick={() => onRetry(att.id)}
                    className="mt-1 px-1.5 py-0.5 bg-white text-red-700 rounded text-[9px] font-semibold flex items-center gap-0.5 hover:bg-red-50"
                  >
                    <RotateCw size={9} /> Retry
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
