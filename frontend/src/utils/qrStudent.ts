import QRCode from 'qrcode';

export interface StudentQrPayloadInput {
  id: string;
  rollNumber?: string | null;
}

export interface ParsedStudentQr {
  studentId?: string;
  rollNumber?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeStudentQrPayload(student: StudentQrPayloadInput): string {
  return JSON.stringify({
    v: 1,
    type: 'sms-student',
    id: student.id,
    ...(student.rollNumber ? { roll: student.rollNumber } : {}),
  });
}

export function parseStudentQrInput(rawInput: string): ParsedStudentQr {
  const trimmed = rawInput.trim();
  if (!trimmed) return {};

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        type?: unknown;
        id?: unknown;
        studentId?: unknown;
        roll?: unknown;
        rollNumber?: unknown;
      };
      const id =
        typeof parsed.id === 'string'
          ? parsed.id
          : typeof parsed.studentId === 'string'
            ? parsed.studentId
            : undefined;
      const roll =
        typeof parsed.roll === 'string'
          ? parsed.roll
          : typeof parsed.rollNumber === 'string'
            ? parsed.rollNumber
            : undefined;

      if (id || roll) {
        return { studentId: id, rollNumber: roll };
      }
    } catch {
      // Fall through to plain ID / roll matching
    }
  }

  if (UUID_REGEX.test(trimmed)) {
    return { studentId: trimmed };
  }

  return { rollNumber: trimmed };
}

export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 180,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}
