import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, CheckCircle2, QrCode, ScanLine } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { parseStudentQrInput } from '../../utils/qrStudent';

export interface QrAttendanceCandidate {
  studentId: string;
  name: string;
  rollNumber: string;
  status: 'pending' | 'present' | 'absent' | 'late' | 'excused';
}

interface QrAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: QrAttendanceCandidate[];
  onMarkStudent: (studentId: string, status: 'present' | 'late') => void;
}

interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

export const QrAttendanceModal: React.FC<QrAttendanceModalProps> = ({
  isOpen,
  onClose,
  students,
  onMarkStudent,
}) => {
  const [scanInput, setScanInput] = useState('');
  const [targetStatus, setTargetStatus] = useState<'present' | 'late'>('present');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastFeedback, setLastFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [recentScans, setRecentScans] = useState<Array<{ id: string; name: string; status: 'present' | 'late'; at: string }>>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cooldownRef = useRef<Map<string, number>>(new Map());

  const supportsBarcodeDetector =
    typeof window !== 'undefined' &&
    'BarcodeDetector' in window &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [onClose, stopCamera]);

  const handleDecodedValue = useCallback(
    (rawValue: string) => {
      const parsed = parseStudentQrInput(rawValue);
      if (!parsed.studentId && !parsed.rollNumber) return;

      const match = students.find((s) => {
        if (parsed.studentId && s.studentId === parsed.studentId) return true;
        if (
          parsed.rollNumber &&
          s.rollNumber &&
          s.rollNumber.trim().toLowerCase() === parsed.rollNumber.trim().toLowerCase()
        ) {
          return true;
        }
        return false;
      });

      if (!match) {
        setLastFeedback({
          ok: false,
          message: `No matching student in the loaded attendance sheet for "${parsed.rollNumber || parsed.studentId}".`,
        });
        return;
      }

      const now = Date.now();
      const lastHit = cooldownRef.current.get(match.studentId) ?? 0;
      if (now - lastHit < 2500) {
        return;
      }
      cooldownRef.current.set(match.studentId, now);

      onMarkStudent(match.studentId, targetStatus);
      const timeLabel = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setLastFeedback({
        ok: true,
        message: `Marked ${match.name}${match.rollNumber ? ` (${match.rollNumber})` : ''} as ${targetStatus.toUpperCase()}.`,
      });
      setRecentScans((prev) => [
        { id: match.studentId, name: match.name, status: targetStatus, at: timeLabel },
        ...prev.filter((x) => x.id !== match.studentId).slice(0, 9),
      ]);
    },
    [onMarkStudent, students, targetStatus],
  );

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      setCameraError(
        err instanceof Error ? err.message : 'Unable to start camera. Use manual or USB QR input below.',
      );
      stopCamera();
    }
  }, [stopCamera]);

  useEffect(() => {
    if (!cameraActive || !supportsBarcodeDetector) return;

    const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector;
    const detector = new Detector({ formats: ['qr_code'] });
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      detector
        .detect(video)
        .then((barcodes) => {
          for (const b of barcodes) {
            if (b.rawValue) handleDecodedValue(b.rawValue);
          }
        })
        .catch(() => {});
    }, 550);

    return () => {
      window.clearInterval(timer);
    };
  }, [cameraActive, handleDecodedValue, supportsBarcodeDetector]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim()) return;
    handleDecodedValue(scanInput);
    setScanInput('');
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="QR Student Check-In" maxWidth="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-neutral-700">
            <ScanLine size={15} className="text-brand-600" />
            <span>Check-in status:</span>
            <select
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value as 'present' | 'late')}
              className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-medium"
            >
              <option value="present">Present</option>
              <option value="late">Late</option>
            </select>
          </div>

          {supportsBarcodeDetector && (
            <Button
              type="button"
              size="sm"
              variant={cameraActive ? 'secondary' : 'primary'}
              onClick={() => (cameraActive ? stopCamera() : void startCamera())}
            >
              {cameraActive ? (
                <>
                  <CameraOff size={14} className="mr-1.5" /> Stop Camera
                </>
              ) : (
                <>
                  <Camera size={14} className="mr-1.5" /> Start Camera Scanner
                </>
              )}
            </Button>
          )}
        </div>

        {cameraError && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {cameraError}
          </p>
        )}

        {cameraActive && (
          <div className="rounded-xl overflow-hidden bg-slate-950 border border-neutral-800 aspect-video max-h-60 flex items-center justify-center">
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          </div>
        )}

        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            type="text"
            autoFocus
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            placeholder="Scan QR with handheld scanner or enter Roll Number / Student ID..."
            className="flex-1 h-10 rounded-lg border border-neutral-300 px-3 text-sm"
          />
          <Button type="submit" variant="primary" disabled={!scanInput.trim()}>
            <QrCode size={15} className="mr-1.5" /> Check In
          </Button>
        </form>

        {lastFeedback && (
          <div
            className={`text-xs rounded-lg px-3 py-2 flex items-center gap-2 border ${
              lastFeedback.ok
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {lastFeedback.ok && <CheckCircle2 size={14} />}
            <span>{lastFeedback.message}</span>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">
            Scanned This Session ({recentScans.length})
          </p>
          {recentScans.length === 0 ? (
            <p className="text-xs text-neutral-500 py-3 text-center border border-dashed border-neutral-200 rounded-lg">
              Scan a student ID card QR or enter their roll number above. Remember to click Save / Submit Attendance afterwards.
            </p>
          ) : (
            <div className="max-h-40 overflow-y-auto divide-y divide-neutral-100 border border-neutral-200 rounded-lg">
              {recentScans.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="font-medium text-neutral-900">{item.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-400">{item.at}</span>
                    <Badge variant={item.status === 'present' ? 'success' : 'warning'}>
                      {item.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-neutral-100">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Done Scanning
          </Button>
        </div>
      </div>
    </Modal>
  );
};
