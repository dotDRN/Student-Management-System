import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { bulkImportStudents, type BulkImportStudentRowInput } from '../../services/students.service';
import { getApiErrorMessage } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { sanitizeSpreadsheetCell } from '../../utils/exportSanitize';
import type { CenterSummary, ProgramSummary } from '../../types';

interface StudentBulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  centers: CenterSummary[];
  programs: ProgramSummary[];
  defaultCenterId?: string;
  onImported: () => void;
}

interface ParsedPreviewRow {
  rowNumber: number;
  payload: BulkImportStudentRowInput;
  errors: string[];
}

const DATE_YYYY_MM_DD = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidIsoDate(val: string): boolean {
  const m = DATE_YYYY_MM_DD.exec(val.trim());
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function parseCellDate(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
    return String(value);
  }
  const str = String(value).trim();
  if (!str) return undefined;
  return str;
}

function parseCellString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = String(value).trim();
  return trimmed || undefined;
}

function mapSpreadsheetRow(rawRow: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawRow)) {
    const key = k.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key === 'fullname' || key === 'studentname' || key === 'name') normalized.fullName = v;
    else if (key === 'rollnumber' || key === 'rollno' || key === 'roll') normalized.rollNumber = v;
    else if (key === 'dob' || key === 'dobyyyymmdd' || key === 'dateofbirth') normalized.dob = v;
    else if (key.startsWith('gender')) normalized.gender = v;
    else if (key === 'guardianname' || key === 'parentname') normalized.guardianName = v;
    else if (key.startsWith('guardianphone') || key === 'phone' || key === 'parentphone') normalized.guardianPhone = v;
    else if (key === 'address') normalized.address = v;
    else if (key === 'stream') normalized.stream = v;
    else if (key === 'post12thchoice' || key === 'post12th') normalized.post12thChoice = v;
    else if (key === 'collegename' || key === 'college') normalized.collegeName = v;
    else if (key.startsWith('enrollmentdate') || key === 'joinedon') normalized.enrollmentDate = v;
    else if (key === 'totalfees' || key === 'fees') normalized.totalFees = v;
  }
  return normalized;
}

export const StudentBulkImportModal: React.FC<StudentBulkImportModalProps> = ({
  isOpen,
  onClose,
  centers,
  programs,
  defaultCenterId,
  onImported,
}) => {
  const toast = useToast();
  const [centerId, setCenterId] = useState('');
  const [programId, setProgramId] = useState('');
  const [fileName, setFileName] = useState('');
  const [previewRows, setPreviewRows] = useState<ParsedPreviewRow[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCenterId((prev) => prev || defaultCenterId || centers[0]?.id || '');
    setProgramId((prev) => prev || programs[0]?.id || '');
  }, [isOpen, defaultCenterId, centers, programs]);

  const validRows = useMemo(
    () => previewRows.filter((r) => r.errors.length === 0).map((r) => r.payload),
    [previewRows],
  );
  const invalidCount = previewRows.length - validRows.length;

  const handleDownloadTemplate = () => {
    const templateRows = [
      {
        'Full Name': sanitizeSpreadsheetCell('Aarav Sharma'),
        'Roll Number': sanitizeSpreadsheetCell('R-101'),
        'DOB (YYYY-MM-DD)': '2012-05-14',
        'Gender (male|female|other)': 'male',
        'Guardian Name': sanitizeSpreadsheetCell('Ramesh Sharma'),
        'Guardian Phone (10 digits)': '9876543210',
        Address: sanitizeSpreadsheetCell('Andheri East, Mumbai'),
        Stream: sanitizeSpreadsheetCell('Science'),
        'Post-12th Choice': sanitizeSpreadsheetCell('Engineering'),
        'College Name': sanitizeSpreadsheetCell(''),
        'Enrollment Date (YYYY-MM-DD)': '2026-06-01',
        'Total Fees': 1500,
      },
    ];
    const ws = XLSX.utils.json_to_sheet(templateRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students Template');
    XLSX.writeFile(wb, 'students_import_template.xlsx');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
      const firstSheet = wb.SheetNames[0];
      if (!firstSheet) {
        toast.error({ title: 'Empty workbook', description: 'No worksheet found in the selected file.' });
        return;
      }

      const rawList = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[firstSheet], {
        defval: '',
      });
      if (rawList.length === 0) {
        setPreviewRows([]);
        toast.warning({ title: 'No rows found', description: 'The spreadsheet has no student rows.' });
        return;
      }
      if (rawList.length > 200) {
        toast.warning({
          title: 'Row limit trimmed to 200',
          description: 'Maximum 200 students can be imported in a single batch.',
        });
      }

      const seenRolls = new Set<string>();
      const parsed: ParsedPreviewRow[] = rawList.slice(0, 200).map((raw, idx) => {
        const mapped = mapSpreadsheetRow(raw);
        const errors: string[] = [];

        const fullName = parseCellString(mapped.fullName) ?? '';
        if (fullName.length < 2) {
          errors.push('Full Name must be at least 2 characters');
        }

        const rollNumber = parseCellString(mapped.rollNumber);
        if (rollNumber) {
          const norm = rollNumber.toLowerCase();
          if (seenRolls.has(norm)) {
            errors.push(`Duplicate Roll Number "${rollNumber}" in file`);
          }
          seenRolls.add(norm);
        }

        const dob = parseCellDate(mapped.dob);
        if (dob && !isValidIsoDate(dob)) {
          errors.push('DOB must be YYYY-MM-DD');
        }

        const rawGender = parseCellString(mapped.gender)?.toLowerCase();
        let gender: 'male' | 'female' | 'other' | undefined;
        if (rawGender) {
          if (rawGender === 'male' || rawGender === 'female' || rawGender === 'other') {
            gender = rawGender;
          } else {
            errors.push('Gender must be male, female, or other');
          }
        }

        const guardianName = parseCellString(mapped.guardianName);
        const guardianPhoneRaw = parseCellString(mapped.guardianPhone);
        const guardianPhone = guardianPhoneRaw?.replace(/\.0$/, '');
        if (guardianPhone && !/^\d{10}$/.test(guardianPhone)) {
          errors.push('Guardian Phone must be exactly 10 digits');
        }

        const address = parseCellString(mapped.address);
        const stream = parseCellString(mapped.stream);
        const post12thChoice = parseCellString(mapped.post12thChoice);
        const collegeName = parseCellString(mapped.collegeName);
        const enrollmentDate = parseCellDate(mapped.enrollmentDate);
        if (enrollmentDate && !isValidIsoDate(enrollmentDate)) {
          errors.push('Enrollment Date must be YYYY-MM-DD');
        }

        let totalFees: number | undefined;
        const rawFees = mapped.totalFees;
        if (rawFees !== undefined && rawFees !== null && String(rawFees).trim() !== '') {
          const numFees = Number(rawFees);
          if (!Number.isFinite(numFees) || numFees < 0) {
            errors.push('Total Fees must be zero or positive');
          } else {
            totalFees = numFees;
          }
        }

        return {
          rowNumber: idx + 1,
          payload: {
            fullName,
            ...(rollNumber ? { rollNumber } : {}),
            ...(dob ? { dob } : {}),
            ...(gender ? { gender } : {}),
            ...(guardianName ? { guardianName } : {}),
            ...(guardianPhone ? { guardianPhone } : {}),
            ...(address ? { address } : {}),
            ...(stream ? { stream } : {}),
            ...(post12thChoice ? { post12thChoice } : {}),
            ...(collegeName ? { collegeName } : {}),
            ...(enrollmentDate ? { enrollmentDate } : {}),
            ...(totalFees !== undefined ? { totalFees } : {}),
          },
          errors,
        };
      });

      setPreviewRows(parsed);
    } catch {
      toast.error({
        title: 'Could not read spreadsheet',
        description: 'Please upload a valid .xlsx, .xls, or .csv file.',
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleClose = () => {
    setFileName('');
    setPreviewRows([]);
    onClose();
  };

  const handleImport = async () => {
    if (!centerId || !programId || validRows.length === 0) return;
    setImporting(true);
    try {
      const res = await bulkImportStudents({
        centerId,
        programId,
        students: validRows,
      });
      toast.success({
        title: `Imported ${res.createdCount} student${res.createdCount === 1 ? '' : 's'}`,
        description:
          invalidCount > 0
            ? `${invalidCount} invalid row(s) from the file were skipped.`
            : 'All students added to the selected center and program.',
      });
      onImported();
      handleClose();
    } catch (err) {
      toast.error({
        title: 'Bulk import failed',
        description: getApiErrorMessage(err, 'Please verify the selected center, program, and spreadsheet rows.'),
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Bulk Import Students (Excel / CSV)" maxWidth="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-neutral-50 border border-neutral-200 p-3">
          <div className="text-xs text-neutral-600">
            <p className="font-semibold text-neutral-800">Step 1: Download the template or prepare your sheet</p>
            <p>Supports up to 200 students per batch (.xlsx, .xls, .csv).</p>
          </div>
          <Button variant="secondary" size="sm" onClick={handleDownloadTemplate}>
            <Download size={14} className="mr-1.5" /> Download Template
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Target Center *</label>
            <select
              value={centerId}
              onChange={(e) => setCenterId(e.target.value)}
              className="w-full h-10 rounded-lg border border-neutral-300 px-3 text-sm bg-white"
            >
              <option value="">Select center...</option>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Target Program *</label>
            <select
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              className="w-full h-10 rounded-lg border border-neutral-300 px-3 text-sm bg-white"
            >
              <option value="">Select program...</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">Step 2: Upload filled file</label>
          <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 px-4 py-5 text-sm text-neutral-600 hover:border-brand-400 hover:bg-brand-50/20 cursor-pointer transition-colors">
            <Upload size={18} className="text-brand-600" />
            <span>{fileName ? `Loaded: ${fileName} (click to replace)` : 'Choose .xlsx, .xls, or .csv file'}</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => void handleFileChange(e)}
            />
          </label>
        </div>

        {previewRows.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-neutral-700">
                Validation Preview ({previewRows.length} rows)
              </span>
              <div className="flex gap-2">
                <Badge variant="success">{validRows.length} Valid</Badge>
                {invalidCount > 0 && <Badge variant="danger">{invalidCount} Invalid (skipped)</Badge>}
              </div>
            </div>

            <div className="max-h-64 overflow-auto rounded-lg border border-neutral-200">
              <table className="w-full text-xs">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 text-left sticky top-0">
                  <tr>
                    <th className="py-2 px-2">#</th>
                    <th className="py-2 px-2">Full Name</th>
                    <th className="py-2 px-2">Roll No</th>
                    <th className="py-2 px-2">Guardian Phone</th>
                    <th className="py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.rowNumber} className="border-b border-neutral-100">
                      <td className="py-1.5 px-2 text-neutral-500">{row.rowNumber}</td>
                      <td className="py-1.5 px-2 font-medium text-neutral-900">
                        {row.payload.fullName || '—'}
                      </td>
                      <td className="py-1.5 px-2 text-neutral-600">{row.payload.rollNumber || '—'}</td>
                      <td className="py-1.5 px-2 text-neutral-600">{row.payload.guardianPhone || '—'}</td>
                      <td className="py-1.5 px-2">
                        {row.errors.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 size={13} /> Valid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-danger">
                            <AlertCircle size={13} /> {row.errors.join('; ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
          <Button variant="secondary" type="button" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            disabled={!centerId || !programId || validRows.length === 0}
            isLoading={importing}
            onClick={() => void handleImport()}
          >
            Import {validRows.length > 0 ? `${validRows.length} Student${validRows.length === 1 ? '' : 's'}` : 'Students'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
