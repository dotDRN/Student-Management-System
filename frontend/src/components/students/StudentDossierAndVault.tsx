import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Award,
  Clock,
  ExternalLink,
  FileText,
  FolderOpen,
  GraduationCap,
  Link2,
  Plus,
  Trash2,
  Upload,
  UserCheck,
  Wallet,
} from 'lucide-react';
import {
  addStudentDocument,
  deleteStudentDocument,
  getStudentDossier,
  type DocumentCategory,
  type DossierTimelineEvent,
  type DossierTimelineEventType,
  type StudentDocumentRecord,
  type StudentDossierResponse,
} from '../../services/students.service';
import { Card } from '../ui/Card';
import { Badge, type BadgeProps } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ConfirmModal } from '../ui/ConfirmModal';
import { useToast } from '../../hooks/useToast';
import { formatDate } from '../../utils/date';

interface StudentDossierAndVaultProps {
  studentId: string;
  canManageStudents: boolean;
}

type TimelineFilter = 'all' | DossierTimelineEventType;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  identity: 'Identity / ID',
  academic: 'Academic Record',
  certificate: 'Certificate',
  medical: 'Medical',
  consent: 'Consent Form',
  other: 'Other',
};

const CATEGORY_BADGE_VARIANT: Record<DocumentCategory, BadgeProps['variant']> = {
  identity: 'primary',
  academic: 'success',
  certificate: 'warning',
  medical: 'danger',
  consent: 'neutral',
  other: 'neutral',
};

const TIMELINE_FILTERS: Array<{ key: TimelineFilter; label: string }> = [
  { key: 'all', label: 'All Events' },
  { key: 'enrollment', label: 'Enrollment' },
  { key: 'lifecycle', label: 'Lifecycle' },
  { key: 'transfer', label: 'Transfers' },
  { key: 'exam', label: 'Exams' },
  { key: 'skill', label: 'Skills' },
  { key: 'fee', label: 'Fees' },
  { key: 'activity', label: 'Activities' },
  { key: 'alert', label: 'Alerts' },
  { key: 'document', label: 'Documents' },
];

const EVENT_TYPE_META: Record<
  DossierTimelineEventType,
  { label: string; variant: BadgeProps['variant']; iconBg: string; icon: React.ReactNode }
> = {
  enrollment: {
    label: 'Enrollment',
    variant: 'primary',
    iconBg: 'bg-brand-50 text-brand-700 border-brand-200/70',
    icon: <UserCheck className="w-4 h-4" />,
  },
  lifecycle: {
    label: 'Lifecycle',
    variant: 'success',
    iconBg: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
    icon: <GraduationCap className="w-4 h-4" />,
  },
  transfer: {
    label: 'Transfer',
    variant: 'neutral',
    iconBg: 'bg-slate-100 text-slate-700 border-slate-200/80',
    icon: <ArrowRightLeft className="w-4 h-4" />,
  },
  exam: {
    label: 'Exam',
    variant: 'primary',
    iconBg: 'bg-indigo-50 text-indigo-700 border-indigo-200/70',
    icon: <GraduationCap className="w-4 h-4" />,
  },
  skill: {
    label: 'Skill',
    variant: 'success',
    iconBg: 'bg-teal-50 text-teal-700 border-teal-200/70',
    icon: <Award className="w-4 h-4" />,
  },
  fee: {
    label: 'Fee',
    variant: 'warning',
    iconBg: 'bg-amber-50 text-amber-700 border-amber-200/70',
    icon: <Wallet className="w-4 h-4" />,
  },
  activity: {
    label: 'Activity',
    variant: 'primary',
    iconBg: 'bg-sky-50 text-sky-700 border-sky-200/70',
    icon: <Activity className="w-4 h-4" />,
  },
  alert: {
    label: 'Alert',
    variant: 'danger',
    iconBg: 'bg-red-50 text-red-700 border-red-200/70',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  document: {
    label: 'Document',
    variant: 'neutral',
    iconBg: 'bg-neutral-100 text-neutral-700 border-neutral-200/80',
    icon: <FileText className="w-4 h-4" />,
  },
};

function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError<{ message?: string; error?: string }>(err)) {
    return err.response?.data?.message || err.response?.data?.error || err.message || fallback;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'External link';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export const StudentDossierAndVault: React.FC<StudentDossierAndVaultProps> = ({
  studentId,
  canManageStudents,
}) => {
  const toast = useToast();

  const [dossier, setDossier] = useState<StudentDossierResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<TimelineFilter>('all');

  // Vault add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState<DocumentCategory>('academic');
  const [docNotes, setDocNotes] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [docFileName, setDocFileName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Vault delete modal state
  const [docToDelete, setDocToDelete] = useState<StudentDocumentRecord | null>(null);

  const loadDossier = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getStudentDossier(studentId);
      setDossier(data);
    } catch (err) {
      setLoadError(extractErrorMessage(err, 'Unable to load student dossier'));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getStudentDossier(studentId);
        if (!cancelled) {
          setDossier(data);
          setLoadError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(extractErrorMessage(err, 'Unable to load student dossier'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const filteredTimeline = useMemo<DossierTimelineEvent[]>(() => {
    if (!dossier) return [];
    if (activeFilter === 'all') return dossier.timeline;
    return dossier.timeline.filter((item) => item.type === activeFilter);
  }, [dossier, activeFilter]);

  const resetForm = () => {
    setDocTitle('');
    setDocCategory('academic');
    setDocNotes('');
    setDocUrl('');
    setDocFileName('');
    setSelectedFile(null);
    setShowAddForm(false);
  };

  const handleSubmitDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = docTitle.trim();
    if (!trimmedTitle) {
      toast.error({ title: 'Title required', description: 'Please enter a title for the document.' });
      return;
    }

    if (uploadMode === 'file') {
      if (!selectedFile) {
        toast.error({ title: 'File required', description: 'Please choose a file to upload (max 10 MB).' });
        return;
      }
      if (selectedFile.size > MAX_UPLOAD_BYTES) {
        toast.error({ title: 'File too large', description: 'Documents cannot exceed 10 MB.' });
        return;
      }
    } else {
      const trimmedUrl = docUrl.trim();
      if (!trimmedUrl || !isSafeExternalUrl(trimmedUrl)) {
        toast.error({
          title: 'Invalid URL',
          description: 'Please provide a valid http:// or https:// document link.',
        });
        return;
      }
    }

    setSubmitting(true);
    try {
      await addStudentDocument(studentId, {
        title: trimmedTitle,
        category: docCategory,
        notes: docNotes.trim() || undefined,
        ...(uploadMode === 'file' && selectedFile
          ? { file: selectedFile }
          : { url: docUrl.trim(), fileName: docFileName.trim() || undefined }),
      });
      toast.success({
        title: 'Document saved',
        description: `"${trimmedTitle}" has been added to the vault.`,
      });
      resetForm();
      await loadDossier();
    } catch (err) {
      toast.error({
        title: 'Upload failed',
        description: extractErrorMessage(err, 'Could not add student document.'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!docToDelete) return;
    const target = docToDelete;
    setDocToDelete(null);
    try {
      await deleteStudentDocument(studentId, target.id);
      toast.success({
        title: 'Document removed',
        description: `"${target.title}" was removed from the vault.`,
      });
      await loadDossier();
    } catch (err) {
      toast.error({
        title: 'Delete failed',
        description: extractErrorMessage(err, 'Could not remove student document.'),
      });
    }
  };

  return (
    <div className="space-y-6 no-print">
      {/* 1. 360° Longitudinal Student Dossier */}
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-brand-50 text-brand-700 border border-brand-200/70">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">
                360° Longitudinal Dossier
              </h2>
              <p className="text-xs text-neutral-500">
                Chronological journey across enrollment, exams, skills, fees, activities, alerts, and vault records
              </p>
            </div>
          </div>

          {dossier && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              <Badge variant="neutral">{dossier.summary.totalEvents} events</Badge>
              <Badge variant="primary">{dossier.summary.examMilestones} exams</Badge>
              <Badge variant="success">{dossier.summary.skillMilestones} skills</Badge>
              <Badge variant="warning">{dossier.summary.feePaymentsCount} fees</Badge>
              <Badge variant="neutral">{dossier.summary.documentCount} docs</Badge>
            </div>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {TIMELINE_FILTERS.map((filter) => {
            const isActive = activeFilter === filter.key;
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveFilter(filter.key)}
                className={
                  isActive
                    ? 'px-3 py-1 rounded-full text-xs font-medium bg-brand-600 text-white transition-colors cursor-pointer'
                    : 'px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200/70 transition-colors cursor-pointer'
                }
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        {loading && !dossier ? (
          <p className="text-sm text-neutral-500 py-4">Loading longitudinal dossier...</p>
        ) : loadError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
            <span>{loadError}</span>
            <Button type="button" size="sm" variant="secondary" onClick={loadDossier}>
              Retry
            </Button>
          </div>
        ) : filteredTimeline.length === 0 ? (
          <p className="text-sm text-neutral-500 py-4">
            No timeline events found for the selected filter.
          </p>
        ) : (
          <ol className="relative border-l border-neutral-200 ml-3 space-y-4">
            {filteredTimeline.map((event) => {
              const meta = EVENT_TYPE_META[event.type];
              return (
                <li key={event.id} className="ml-6">
                  <span
                    className={`absolute -left-3.5 flex h-7 w-7 items-center justify-center rounded-full border ${meta.iconBg}`}
                  >
                    {meta.icon}
                  </span>
                  <div className="rounded-lg border border-neutral-200/80 bg-neutral-50/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                        <span className="text-sm font-medium text-neutral-900 truncate">
                          {event.title}
                        </span>
                      </div>
                      <span className="text-xs text-neutral-500 whitespace-nowrap">
                        {formatDate(event.date)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-600">{event.subtitle}</p>
                    {event.badge && (
                      <div className="mt-2">
                        <Badge variant="neutral">{event.badge}</Badge>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {/* 2. Student Document Vault */}
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/70">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Student Document Vault</h2>
              <p className="text-xs text-neutral-500">
                Store verified identity proofs, certificates, medical notes, consent forms, and external records
              </p>
            </div>
          </div>

          {canManageStudents && (
            <Button
              type="button"
              size="sm"
              variant={showAddForm ? 'secondary' : 'primary'}
              onClick={() => setShowAddForm((prev) => !prev)}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              {showAddForm ? 'Close Form' : 'Add Document'}
            </Button>
          )}
        </div>

        {canManageStudents && showAddForm && (
          <form
            onSubmit={handleSubmitDocument}
            className="mb-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-4"
          >
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={uploadMode === 'file' ? 'primary' : 'secondary'}
                onClick={() => setUploadMode('file')}
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                Upload File
              </Button>
              <Button
                type="button"
                size="sm"
                variant={uploadMode === 'url' ? 'primary' : 'secondary'}
                onClick={() => setUploadMode('url')}
              >
                <Link2 className="w-3.5 h-3.5 mr-1.5" />
                External HTTPS Link
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Document Title *
                </label>
                <input
                  type="text"
                  required
                  maxLength={160}
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="e.g., Aadhaar Card, Transfer Certificate"
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Category *
                </label>
                <select
                  value={docCategory}
                  onChange={(e) => setDocCategory(e.target.value as DocumentCategory)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none"
                >
                  {(Object.keys(CATEGORY_LABELS) as DocumentCategory[]).map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {uploadMode === 'file' ? (
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Select File (PDF, JPG, PNG, WEBP, DOC, DOCX, TXT, CSV — max 10 MB) *
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt,.csv"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-neutral-700 file:mr-3 file:rounded-lg file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-neutral-700 hover:file:bg-neutral-50"
                />
                {selectedFile && (
                  <p className="mt-1 text-xs text-neutral-500">
                    Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Document URL (http / https) *
                  </label>
                  <input
                    type="url"
                    required
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Display File Name (optional)
                  </label>
                  <input
                    type="text"
                    maxLength={160}
                    value={docFileName}
                    onChange={(e) => setDocFileName(e.target.value)}
                    placeholder="marksheet-2025.pdf"
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Notes (optional)
              </label>
              <input
                type="text"
                maxLength={500}
                value={docNotes}
                onChange={(e) => setDocNotes(e.target.value)}
                placeholder="Verification status or remarks..."
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit" size="sm" isLoading={submitting}>
                Save Document
              </Button>
            </div>
          </form>
        )}

        {!dossier || dossier.documents.length === 0 ? (
          <p className="text-sm text-neutral-500 py-2">
            No documents stored in this student&apos;s vault yet.
          </p>
        ) : (
          <div className="divide-y divide-neutral-200/80 border border-neutral-200/80 rounded-xl">
            {dossier.documents.map((doc) => {
              const safeUrl = isSafeExternalUrl(doc.url) ? doc.url : null;
              return (
                <div
                  key={doc.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-neutral-900 truncate">
                        {doc.title}
                      </span>
                      <Badge variant={CATEGORY_BADGE_VARIANT[doc.category]}>
                        {CATEGORY_LABELS[doc.category]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      {doc.fileName} • {formatFileSize(doc.fileSize)} • Uploaded{' '}
                      {formatDate(doc.uploadedAt)}
                      {doc.uploadedByName ? ` by ${doc.uploadedByName}` : ''}
                    </p>
                    {doc.notes && (
                      <p className="mt-1 text-xs text-neutral-600">{doc.notes}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {safeUrl && (
                      <a
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open
                      </a>
                    )}
                    {canManageStudents && (
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={() => setDocToDelete(doc)}
                        aria-label={`Delete ${doc.title}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ConfirmModal
        open={Boolean(docToDelete)}
        title="Delete Document"
        message={
          docToDelete
            ? `Remove "${docToDelete.title}" (${docToDelete.fileName}) from the student's document vault?`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDocToDelete(null)}
      />
    </div>
  );
};
