import React, { useEffect, useState } from 'react';
import { Printer, QrCode } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { formatDate } from '../../utils/date';
import { encodeStudentQrPayload, generateQrDataUrl } from '../../utils/qrStudent';

export interface IdCardStudent {
  id: string;
  fullName: string;
  rollNumber?: string | null;
  centerName?: string | null;
  programName?: string | null;
  stream?: string | null;
  guardianPhone?: string | null;
  enrollmentDate?: string | Date | null;
}

interface StudentIdCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: IdCardStudent[];
  title?: string;
}

const IdCardGrid: React.FC<{ students: IdCardStudent[]; qrMap: Record<string, string> }> = ({
  students,
  qrMap,
}) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {students.map((stu) => {
      const qrSrc = qrMap[stu.id];
      return (
        <div
          key={stu.id}
          className="break-inside-avoid rounded-xl border border-neutral-300 bg-white overflow-hidden shadow-xs"
        >
          <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-300 font-semibold">
                EduSpace Student ID
              </p>
              <p className="text-xs font-semibold truncate">{stu.centerName || 'Learning Center'}</p>
            </div>
            <QrCode size={16} className="text-brand-300 shrink-0" />
          </div>

          <div className="p-4 flex items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 font-bold text-sm flex items-center justify-center shrink-0">
                  {stu.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-neutral-900 text-sm truncate">{stu.fullName}</h4>
                  <p className="text-xs text-neutral-500">
                    Roll: <span className="font-mono font-medium text-neutral-800">{stu.rollNumber || 'N/A'}</span>
                  </p>
                </div>
              </div>

              <div className="text-xs text-neutral-600 pt-1 space-y-0.5">
                <p>
                  <span className="text-neutral-400">Program:</span>{' '}
                  <span className="font-medium text-neutral-800">{stu.programName || 'General'}</span>
                  {stu.stream ? ` · ${stu.stream}` : ''}
                </p>
                {stu.guardianPhone && (
                  <p>
                    <span className="text-neutral-400">Guardian:</span> {stu.guardianPhone}
                  </p>
                )}
                {stu.enrollmentDate && (
                  <p>
                    <span className="text-neutral-400">Joined:</span>{' '}
                    {formatDate(stu.enrollmentDate, 'MMM yyyy')}
                  </p>
                )}
              </div>
            </div>

            <div className="shrink-0 flex flex-col items-center">
              {qrSrc ? (
                <img
                  src={qrSrc}
                  alt={`QR Code for ${stu.fullName}`}
                  className="w-24 h-24 rounded-md border border-neutral-200 p-1 bg-white"
                />
              ) : (
                <div className="w-24 h-24 rounded-md border border-neutral-200 bg-neutral-50 flex items-center justify-center text-[10px] text-neutral-400">
                  Generating...
                </div>
              )}
              <span className="text-[9px] font-mono text-neutral-400 mt-1">
                {stu.id.slice(0, 8)}
              </span>
            </div>
          </div>
        </div>
      );
    })}
  </div>
);

export const StudentIdCardModal: React.FC<StudentIdCardModalProps> = ({
  isOpen,
  onClose,
  students,
  title = 'Printable QR Student ID Cards',
}) => {
  const [qrMap, setQrMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen || students.length === 0) return;
    let alive = true;

    (async () => {
      const pairs = await Promise.all(
        students.map(async (s) => {
          const payload = encodeStudentQrPayload({
            id: s.id,
            rollNumber: s.rollNumber,
          });
          const dataUrl = await generateQrDataUrl(payload);
          return [s.id, dataUrl] as const;
        }),
      );
      if (alive) {
        setQrMap(Object.fromEntries(pairs));
      }
    })();

    return () => {
      alive = false;
    };
  }, [isOpen, students]);

  return (
    <>
      <div className="no-print">
        <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="2xl">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
              <span>
                Showing {students.length} student ID card{students.length === 1 ? '' : 's'}. Scan any card on the Attendance Check-In screen to mark Present or Late immediately.
              </span>
              <Button type="button" size="sm" variant="primary" onClick={() => window.print()}>
                <Printer size={14} className="mr-1.5" /> Print ID Cards
              </Button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto pr-1">
              <IdCardGrid students={students} qrMap={qrMap} />
            </div>
          </div>
        </Modal>
      </div>

      {isOpen && students.length > 0 && (
        <div className="hidden print:block p-4 bg-white">
          <IdCardGrid students={students} qrMap={qrMap} />
        </div>
      )}
    </>
  );
};
