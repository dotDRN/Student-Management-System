import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { encodeStudentQrPayload, parseStudentQrInput } from '../src/utils/qrStudent.ts';
import {
  clearOfflineAttendanceQueue,
  enqueueAttendanceMutation,
  flushAttendanceQueue,
  isLikelyNetworkError,
  listQueuedAttendanceMutations,
} from '../src/utils/offlineAttendanceQueue.ts';

describe('Component 3.6: QR Student ID Payloads & Offline Attendance Queue', () => {
  it('encodes and decodes structured student QR payloads, UUIDs, and roll numbers', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    const payload = encodeStudentQrPayload({ id, rollNumber: 'R-104' });
    const decoded = parseStudentQrInput(payload);
    assert.deepEqual(decoded, { studentId: id, rollNumber: 'R-104' });

    assert.deepEqual(parseStudentQrInput(id), { studentId: id });
    assert.deepEqual(parseStudentQrInput('R-205'), { rollNumber: 'R-205' });
    assert.deepEqual(parseStudentQrInput('   '), {});
  });

  it('detects network failures distinctly from API validation responses', () => {
    assert.equal(isLikelyNetworkError({ code: 'ERR_NETWORK' }), true);
    assert.equal(isLikelyNetworkError({ message: 'Network Error' }), true);
    assert.equal(isLikelyNetworkError({ response: { status: 400 }, message: 'Bad request' }), false);
  });

  it('coalesces offline session edits by sessionId and flushes cleanly when synced', async () => {
    await clearOfflineAttendanceQueue();

    await enqueueAttendanceMutation({
      sessionId: 'sess-1',
      sessionLabel: 'Center A · 2026-11-14',
      records: [{ recordId: 'rec-1', status: 'present', remarks: null }],
    });

    await enqueueAttendanceMutation({
      sessionId: 'sess-1',
      sessionLabel: 'Center A · 2026-11-14',
      records: [
        { recordId: 'rec-1', status: 'present', remarks: null },
        { recordId: 'rec-2', status: 'late', remarks: 'Bus delayed' },
      ],
    });

    await enqueueAttendanceMutation({
      sessionId: 'sess-2',
      sessionLabel: 'Center B · 2026-11-14',
      records: [{ recordId: 'rec-3', status: 'absent', remarks: null }],
    });

    const queued = await listQueuedAttendanceMutations();
    assert.equal(queued.length, 2);
    assert.equal(queued.find((q) => q.sessionId === 'sess-1')?.records.length, 2);

    const syncedSessions: string[] = [];
    const firstPass = await flushAttendanceQueue(async (sessionId) => {
      if (sessionId === 'sess-2') {
        throw new Error('Temporary offline drop');
      }
      syncedSessions.push(sessionId);
    });

    assert.deepEqual(syncedSessions, ['sess-1']);
    assert.equal(firstPass.synced, 1);
    assert.equal(firstPass.failed, 1);
    assert.equal(firstPass.remaining.length, 1);
    assert.equal(firstPass.remaining[0].attempts, 1);

    const secondPass = await flushAttendanceQueue(async (sessionId) => {
      syncedSessions.push(sessionId);
    });
    assert.equal(secondPass.synced, 1);
    assert.equal(secondPass.failed, 0);
    assert.equal(secondPass.remaining.length, 0);
  });
});
