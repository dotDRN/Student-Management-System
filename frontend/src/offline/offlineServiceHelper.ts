import { useSyncStore } from "../store/useSyncStore";
import { isLikelyNetworkError } from "../utils/offlineAttendanceQueue";

export function isNavigatorOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Network-first read with seamless Dexie offline fallback and cache warming.
 */
export async function withOfflineRead<T>(
  onlineFetch: () => Promise<T>,
  offlineRead: () => Promise<T>,
  cacheWrite?: (data: T) => Promise<void>,
): Promise<T> {
  if (isNavigatorOffline()) {
    useSyncStore.getState().setOnline(false);
    return offlineRead();
  }

  try {
    const data = await onlineFetch();
    if (cacheWrite) {
      void cacheWrite(data).catch(() => {
        // Never fail an online read if IndexedDB write fails
      });
    }
    return data;
  } catch (err) {
    if (isLikelyNetworkError(err)) {
      useSyncStore.getState().setOnline(false);
      return offlineRead();
    }
    throw err;
  }
}

/**
 * Network-first mutation with automatic offline optimistic write + outbox queueing.
 */
export async function withOfflineMutation<T>(
  onlineMutate: () => Promise<T>,
  offlineMutate: () => Promise<T>,
  onOnlineSuccess?: (data: T) => Promise<void>,
): Promise<T> {
  if (isNavigatorOffline()) {
    useSyncStore.getState().setOnline(false);
    return offlineMutate();
  }

  try {
    const data = await onlineMutate();
    if (onOnlineSuccess) {
      void onOnlineSuccess(data).catch(() => {});
    }
    return data;
  } catch (err) {
    if (isLikelyNetworkError(err)) {
      useSyncStore.getState().setOnline(false);
      return offlineMutate();
    }
    throw err;
  }
}
