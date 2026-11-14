export interface QueuedAttendanceRecordInput {
  recordId: string;
  status: 'pending' | 'present' | 'absent' | 'late' | 'excused';
  remarks: string | null;
}

export interface QueuedAttendanceItem {
  id: string;
  sessionId: string;
  sessionLabel: string;
  records: QueuedAttendanceRecordInput[];
  queuedAt: string;
  attempts: number;
  lastError?: string | null;
}

const DB_NAME = 'edbase_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'attendance_queue';
const FALLBACK_KEY = 'edbase_attendance_offline_queue_v1';

// In-memory fallback for environments without IndexedDB or localStorage (e.g. unit tests)
const memoryFallback = new Map<string, QueuedAttendanceItem>();

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

function readFallbackItems(): QueuedAttendanceItem[] {
  if (typeof localStorage === 'undefined') {
    return Array.from(memoryFallback.values());
  }
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedAttendanceItem[]) : [];
  } catch {
    return Array.from(memoryFallback.values());
  }
}

function writeFallbackItems(items: QueuedAttendanceItem[]): void {
  if (typeof localStorage === 'undefined') {
    memoryFallback.clear();
    for (const item of items) memoryFallback.set(item.id, item);
    return;
  }
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(items));
  } catch {
    memoryFallback.clear();
    for (const item of items) memoryFallback.set(item.id, item);
  }
}

export function isLikelyNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  if (!err || typeof err !== 'object') return false;
  const candidate = err as {
    code?: string;
    message?: string;
    response?: unknown;
  };
  if (!candidate.response) {
    if (
      candidate.code === 'ERR_NETWORK' ||
      candidate.code === 'ECONNABORTED' ||
      candidate.code === 'ERR_INTERNET_DISCONNECTED'
    ) {
      return true;
    }
    if (typeof candidate.message === 'string' && /network error|failed to fetch|offline/i.test(candidate.message)) {
      return true;
    }
  }
  return false;
}

export async function listQueuedAttendanceMutations(): Promise<QueuedAttendanceItem[]> {
  if (!hasIndexedDb()) {
    return readFallbackItems().sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  }
  try {
    const db = await openQueueDb();
    return await new Promise<QueuedAttendanceItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = Array.isArray(req.result) ? (req.result as QueuedAttendanceItem[]) : [];
        db.close();
        resolve(list.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt)));
      };
      req.onerror = () => {
        db.close();
        reject(req.error ?? new Error('Failed to read attendance queue'));
      };
    });
  } catch {
    return readFallbackItems().sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  }
}

async function putQueuedItem(item: QueuedAttendanceItem): Promise<void> {
  if (!hasIndexedDb()) {
    const existing = readFallbackItems().filter((x) => x.id !== item.id);
    writeFallbackItems([...existing, item]);
    return;
  }
  try {
    const db = await openQueueDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(item);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('Failed to write attendance queue item'));
      };
    });
  } catch {
    const existing = readFallbackItems().filter((x) => x.id !== item.id);
    writeFallbackItems([...existing, item]);
  }
}

export async function enqueueAttendanceMutation(payload: {
  sessionId: string;
  sessionLabel: string;
  records: QueuedAttendanceRecordInput[];
}): Promise<QueuedAttendanceItem> {
  const item: QueuedAttendanceItem = {
    id: payload.sessionId,
    sessionId: payload.sessionId,
    sessionLabel: payload.sessionLabel,
    records: payload.records,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };
  await putQueuedItem(item);
  return item;
}

export async function removeQueuedAttendanceMutation(sessionId: string): Promise<void> {
  if (!hasIndexedDb()) {
    writeFallbackItems(readFallbackItems().filter((x) => x.id !== sessionId));
    return;
  }
  try {
    const db = await openQueueDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(sessionId);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('Failed to remove queued attendance item'));
      };
    });
  } catch {
    writeFallbackItems(readFallbackItems().filter((x) => x.id !== sessionId));
  }
}

export async function clearOfflineAttendanceQueue(): Promise<void> {
  const items = await listQueuedAttendanceMutations();
  for (const item of items) {
    await removeQueuedAttendanceMutation(item.sessionId);
  }
}

export async function flushAttendanceQueue(
  executor: (sessionId: string, records: QueuedAttendanceRecordInput[]) => Promise<unknown>,
): Promise<{ synced: number; failed: number; remaining: QueuedAttendanceItem[] }> {
  const items = await listQueuedAttendanceMutations();
  let synced = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await executor(item.sessionId, item.records);
      await removeQueuedAttendanceMutation(item.sessionId);
      synced += 1;
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : 'Sync failed';
      await putQueuedItem({
        ...item,
        attempts: item.attempts + 1,
        lastError: msg,
      });
    }
  }

  const remaining = await listQueuedAttendanceMutations();
  return { synced, failed, remaining };
}
