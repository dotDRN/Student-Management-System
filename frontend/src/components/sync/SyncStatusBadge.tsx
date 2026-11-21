import React from "react";
import {
  AlertTriangle,
  Cloud,
  CloudOff,
  KeyRound,
  RefreshCw,
} from "lucide-react";
import { useSyncStore } from "../../store/useSyncStore";
import { useAuthStore } from "../../store/useAuthStore";
import { syncEngine } from "../../offline/syncEngine";

function formatShortTime(iso: string | null): string {
  if (!iso) return "Not synced yet";
  try {
    const dt = new Date(iso);
    return `Synced ${dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return "Synced";
  }
}

export const SyncStatusBadge: React.FC = () => {
  const {
    isOnline,
    isSyncing,
    pendingCount,
    conflictCount,
    lastSyncedAt,
    lastSyncError,
    setConflictModalOpen,
  } = useSyncStore();
  const { needsReauth, setNeedsReauth } = useAuthStore();

  if (needsReauth) {
    return (
      <button
        type="button"
        onClick={() => setNeedsReauth(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 transition-colors"
        title="Your session expired. Sign in again to upload queued offline changes."
      >
        <KeyRound size={13} />
        <span className="hidden sm:inline">Sign in to sync</span>
        {pendingCount > 0 && (
          <span className="px-1.5 py-0.2 rounded-full bg-amber-600 text-white text-[10px]">
            {pendingCount}
          </span>
        )}
      </button>
    );
  }

  if (conflictCount > 0) {
    return (
      <button
        type="button"
        onClick={() => setConflictModalOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
        title="Resolve sync conflicts between your offline edits and server changes"
      >
        <AlertTriangle size={13} className="text-red-600" />
        <span>
          {conflictCount} {conflictCount === 1 ? "Conflict" : "Conflicts"}
        </span>
      </button>
    );
  }

  if (!isOnline) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200"
        title="Working offline. Changes are safely saved on this device and will sync automatically when reconnected."
      >
        <CloudOff size={13} className="text-amber-600" />
        <span>Offline</span>
        {pendingCount > 0 && (
          <span className="hidden sm:inline text-amber-700 font-medium">
            · {pendingCount} saved locally
          </span>
        )}
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200"
        title="Synchronizing local changes with cloud database"
      >
        <RefreshCw size={13} className="animate-spin text-brand-600" />
        <span className="hidden sm:inline">
          Syncing{pendingCount > 0 ? ` (${pendingCount})` : "..."}
        </span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <button
        type="button"
        onClick={() => void syncEngine.syncNow()}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
        title={lastSyncError || "Click to sync pending local changes now"}
      >
        <RefreshCw size={13} />
        <span>{pendingCount} pending</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void syncEngine.syncNow()}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50/80 text-emerald-700 border border-emerald-200/70 hover:bg-emerald-100 transition-colors"
      title={`${formatShortTime(lastSyncedAt)} — Click to refresh offline cache`}
    >
      <Cloud size={13} className="text-emerald-600" />
      <span className="hidden lg:inline">{formatShortTime(lastSyncedAt)}</span>
    </button>
  );
};
