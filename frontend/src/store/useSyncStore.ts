import { create } from "zustand";
import type { SyncConflictItem } from "../offline/syncTypes";

interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  conflictCount: number;
  conflicts: SyncConflictItem[];
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  isConflictModalOpen: boolean;

  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  setCounts: (pendingCount: number, conflicts: SyncConflictItem[]) => void;
  setLastSyncedAt: (iso: string | null) => void;
  setLastSyncError: (err: string | null) => void;
  setConflictModalOpen: (open: boolean) => void;
  reset: () => void;
}

export const useSyncStore = create<SyncState>()((set) => ({
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  isSyncing: false,
  pendingCount: 0,
  conflictCount: 0,
  conflicts: [],
  lastSyncedAt: null,
  lastSyncError: null,
  isConflictModalOpen: false,

  setOnline: (isOnline) => set({ isOnline }),
  setSyncing: (isSyncing) => set({ isSyncing }),
  setCounts: (pendingCount, conflicts) =>
    set({
      pendingCount,
      conflicts,
      conflictCount: conflicts.length,
    }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
  setLastSyncError: (lastSyncError) => set({ lastSyncError }),
  setConflictModalOpen: (isConflictModalOpen) => set({ isConflictModalOpen }),
  reset: () =>
    set({
      isSyncing: false,
      pendingCount: 0,
      conflictCount: 0,
      conflicts: [],
      lastSyncedAt: null,
      lastSyncError: null,
      isConflictModalOpen: false,
    }),
}));
