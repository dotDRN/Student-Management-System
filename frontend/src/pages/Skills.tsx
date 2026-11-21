import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Grid, Megaphone, Plus, Save, User } from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { SkillProgressionChart } from '../components/skills/SkillProgressionChart';
import { usePermission } from '../hooks/usePermission';
import { useToast } from '../hooks/useToast';
import { getApiErrorMessage } from '../services/api';
import { getCenterDetails, listCenters, listPrograms } from '../services/centers.service';
import { listBatches, type BatchSummary } from '../services/batches.service';
import { getStudents } from '../services/students.service';
import {
  addSkill,
  bulkUpsertSkills,
  deleteSkill,
  getSkillMatrix,
  getSkillsByStudent,
  listSkillDefinitions,
  updateSkill,
  type BulkSkillEntryInput,
  type SkillMatrixResponse,
} from '../services/skills.service';
import type {
  CenterSummary,
  ProgramSummary,
  SkillDefinition,
  SkillRecord,
  Student,
} from '../types';
import { formatDate } from '../utils/date';

interface SkillFormState {
  id: string;
  skillId: string;
  level: number;
  remarks: string;
  assessedOn: string;
}

type SkillsViewMode = 'single' | 'matrix';

function todayUtcDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

function toDateInputValue(value?: string | Date): string {
  if (!value) return todayUtcDateInput();
  const str = String(value);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(str);
  if (match) return match[1];
  const formatted = formatDate(str, 'yyyy-MM-dd');
  return formatted === 'Invalid Date' ? todayUtcDateInput() : formatted;
}

export const Skills: React.FC = () => {
  const { can } = usePermission();
  const toast = useToast();
  const canManageSkills = can('manage', 'skills');

  const [mode, setMode] = useState<SkillsViewMode>('single');

  const [students, setStudents] = useState<Student[]>([]);
  const [centers, setCenters] = useState<CenterSummary[]>([]);
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [centerProgramIds, setCenterProgramIds] = useState<string[] | null>(null);

  const [selectedId, setSelectedId] = useState('');
  const [skillsPayload, setSkillsPayload] = useState<SkillRecord[]>([]);
  const [skillDefs, setSkillDefs] = useState<SkillDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [newSkillLog, setNewSkillLog] = useState<SkillFormState>({
    id: '',
    skillId: '',
    level: 3,
    remarks: '',
    assessedOn: todayUtcDateInput(),
  });

  // Matrix mode state
  const [matrixCenterId, setMatrixCenterId] = useState('');
  const [matrixProgramId, setMatrixProgramId] = useState('');
  const [matrixBatches, setMatrixBatches] = useState<BatchSummary[]>([]);
  const [matrixBatchId, setMatrixBatchId] = useState('');
  const [matrixDate, setMatrixDate] = useState(todayUtcDateInput);
  const [matrixData, setMatrixData] = useState<SkillMatrixResponse | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixSaving, setMatrixSaving] = useState(false);
  const [matrixLevels, setMatrixLevels] = useState<Record<string, string>>({});
  const [baselineLevels, setBaselineLevels] = useState<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [studentRes, defsRes, centersRes, programsRes] = await Promise.all([
          getStudents({ limit: 200 }),
          listSkillDefinitions(),
          listCenters(),
          listPrograms(),
        ]);
        if (!alive) return;
        setStudents(studentRes.students);
        setSkillDefs(defsRes);
        setCenters(centersRes);
        setPrograms(programsRes);
        if (studentRes.students[0]) {
          setSelectedId(studentRes.students[0].id);
        }
        if (centersRes[0]) {
          setMatrixCenterId(centersRes[0].id);
        }
        if (programsRes[0]) {
          setMatrixProgramId(programsRes[0].id);
        }
      } catch (err) {
        if (alive) {
          setError(getApiErrorMessage(err, 'Failed to load initial skill tracking data.'));
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!matrixCenterId) {
      setCenterProgramIds(null);
      return;
    }
    let alive = true;
    getCenterDetails(matrixCenterId)
      .then((detail) => {
        if (!alive) return;
        const linkedIds =
          detail.centerPrograms
            ?.map((cp) => cp.program?.id ?? cp.programId)
            .filter((id): id is string => Boolean(id)) ?? [];
        setCenterProgramIds(linkedIds.length > 0 ? linkedIds : null);
      })
      .catch(() => {
        if (alive) setCenterProgramIds(null);
      });
    return () => {
      alive = false;
    };
  }, [matrixCenterId]);

  const matrixProgramOptions = useMemo(() => {
    if (!centerProgramIds || centerProgramIds.length === 0) return programs;
    const filtered = programs.filter((p) => centerProgramIds.includes(p.id));
    return filtered.length > 0 ? filtered : programs;
  }, [programs, centerProgramIds]);

  useEffect(() => {
    if (
      matrixProgramOptions.length > 0 &&
      !matrixProgramOptions.some((p) => p.id === matrixProgramId)
    ) {
      setMatrixProgramId(matrixProgramOptions[0].id);
    }
  }, [matrixProgramOptions, matrixProgramId]);

  const loadStudentSkills = useCallback(async (studentId: string) => {
    if (!studentId) {
      setSkillsPayload([]);
      return;
    }
    setDetailLoading(true);
    setError(null);
    try {
      const records = await getSkillsByStudent(studentId);
      setSkillsPayload(Array.isArray(records) ? records : []);
    } catch (err) {
      setSkillsPayload([]);
      setError(getApiErrorMessage(err, 'Failed to load skill records.'));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'single') {
      void loadStudentSkills(selectedId);
    }
  }, [mode, selectedId, loadStudentSkills]);

  useEffect(() => {
    if (!matrixCenterId || !matrixProgramId) {
      setMatrixBatches([]);
      setMatrixBatchId('');
      return;
    }
    let alive = true;
    listBatches({ centerId: matrixCenterId, programId: matrixProgramId })
      .then((list) => {
        if (!alive) return;
        const safeList = Array.isArray(list) ? list : [];
        setMatrixBatches(safeList);
        setMatrixBatchId((prev) => (prev && !safeList.some((b) => b.id === prev) ? '' : prev));
      })
      .catch(() => {
        if (alive) {
          setMatrixBatches([]);
          setMatrixBatchId('');
        }
      });
    return () => {
      alive = false;
    };
  }, [matrixCenterId, matrixProgramId]);

  const loadMatrix = useCallback(async () => {
    if (!matrixCenterId || !matrixProgramId) {
      setMatrixData(null);
      return;
    }
    setMatrixLoading(true);
    setError(null);
    try {
      const res = await getSkillMatrix({
        centerId: matrixCenterId,
        programId: matrixProgramId,
        ...(matrixBatchId ? { batchId: matrixBatchId } : {}),
        assessedOn: matrixDate || undefined,
      });
      setMatrixData(res);

      const initialLevels: Record<string, string> = {};
      const baseline: Record<string, number> = {};
      for (const log of res.existingLogs) {
        const key = `${log.studentId}:${log.skillId}`;
        if (!(key in baseline)) {
          baseline[key] = log.level;
          initialLevels[key] = String(log.level);
        }
      }
      setBaselineLevels(baseline);
      setMatrixLevels(initialLevels);
    } catch (err) {
      setMatrixData(null);
      setError(getApiErrorMessage(err, 'Failed to load class skill matrix.'));
    } finally {
      setMatrixLoading(false);
    }
  }, [matrixCenterId, matrixProgramId, matrixBatchId, matrixDate]);

  useEffect(() => {
    if (mode === 'matrix') {
      void loadMatrix();
    }
  }, [mode, loadMatrix]);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedId) ?? null,
    [students, selectedId],
  );

  const availableSkills = useMemo(() => {
    if (!selectedStudent?.programId) return skillDefs;
    return skillDefs.filter((sd) => sd.programId === selectedStudent.programId);
  }, [skillDefs, selectedStudent]);

  const selectedSkillDef = useMemo(
    () =>
      availableSkills.find((sd) => sd.id === newSkillLog.skillId) ??
      skillDefs.find((sd) => sd.id === newSkillLog.skillId) ??
      null,
    [availableSkills, skillDefs, newSkillLog.skillId],
  );

  const selectedMaxLevel = selectedSkillDef?.maxLevel ?? 5;

  const modalSkillOptions = useMemo(() => {
    if (!newSkillLog.skillId || availableSkills.some((sd) => sd.id === newSkillLog.skillId)) {
      return availableSkills;
    }
    const existingSkill = skillsPayload.find((sk) => sk.id === newSkillLog.id)?.skill;
    return existingSkill ? [existingSkill, ...availableSkills] : availableSkills;
  }, [availableSkills, newSkillLog.id, newSkillLog.skillId, skillsPayload]);

  const openCreateModal = () => {
    const firstSkill = availableSkills[0];
    const maxLvl = firstSkill?.maxLevel ?? 5;
    setNewSkillLog({
      id: '',
      skillId: firstSkill?.id ?? '',
      level: Math.min(3, maxLvl),
      remarks: '',
      assessedOn: todayUtcDateInput(),
    });
    setIsModalOpen(true);
  };

  const handleEdit = (skill: SkillRecord) => {
    const skillId = skill.skillId ?? skill.skill?.id ?? '';
    const maxLvl =
      skill.skill?.maxLevel ??
      skillDefs.find((sd) => sd.id === skillId)?.maxLevel ??
      5;
    const clampedLevel = Math.min(Math.max(skill.level ?? 1, 1), maxLvl);
    setNewSkillLog({
      id: skill.id,
      skillId,
      level: clampedLevel,
      remarks: skill.remarks ?? '',
      assessedOn: toDateInputValue(skill.assessedOn),
    });
    setIsModalOpen(true);
  };

  const handleSaveSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !newSkillLog.skillId || !canManageSkills) return;

    const payload = {
      skillId: newSkillLog.skillId,
      level: newSkillLog.level,
      remarks: newSkillLog.remarks.trim() || undefined,
      assessedOn: newSkillLog.assessedOn || undefined,
    };

    try {
      setSaving(true);
      if (newSkillLog.id) {
        await updateSkill(newSkillLog.id, payload);
        toast.success({
          title: 'Assessment updated',
          description: 'The skill proficiency record has been updated.',
        });
      } else {
        await addSkill(selectedId, payload);
        toast.success({
          title: 'Assessment recorded',
          description: 'New skill assessment saved.',
        });
      }
      setIsModalOpen(false);
      await loadStudentSkills(selectedId);
    } catch (err) {
      toast.error({
        title: 'Save failed',
        description: getApiErrorMessage(err, 'Failed to save skill assessment.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedId || !deleteTargetId || !canManageSkills) return;
    const targetId = deleteTargetId;
    setDeleteTargetId(null);

    try {
      setDetailLoading(true);
      await deleteSkill(targetId);
      toast.success({
        title: 'Assessment deleted',
        description: 'The skill assessment record was removed.',
      });
      await loadStudentSkills(selectedId);
    } catch (err) {
      toast.error({
        title: 'Delete failed',
        description: getApiErrorMessage(err, 'Failed to delete skill assessment.'),
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const dirtyMatrixEntries = useMemo(() => {
    if (!matrixData) return [] as BulkSkillEntryInput[];
    const skillMaxMap = new Map(matrixData.skills.map((sk) => [sk.id, sk.maxLevel ?? 5]));
    const entries: BulkSkillEntryInput[] = [];

    for (const [key, rawValue] of Object.entries(matrixLevels)) {
      const trimmed = rawValue.trim();
      if (!trimmed) continue;
      const numeric = Number.parseInt(trimmed, 10);
      if (!Number.isInteger(numeric)) continue;

      const [studentId, skillId] = key.split(':');
      if (!studentId || !skillId) continue;

      const maxLvl = skillMaxMap.get(skillId) ?? 5;
      if (numeric < 1 || numeric > maxLvl) continue;

      if (baselineLevels[key] !== numeric) {
        entries.push({ studentId, skillId, level: numeric });
      }
    }

    return entries;
  }, [matrixData, matrixLevels, baselineLevels]);

  const handleMatrixCellChange = (studentId: string, skillId: string, rawVal: string, maxLvl: number) => {
    const key = `${studentId}:${skillId}`;
    if (rawVal === '') {
      setMatrixLevels((prev) => ({ ...prev, [key]: '' }));
      return;
    }
    const parsed = Number.parseInt(rawVal, 10);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(Math.max(parsed, 1), maxLvl);
    setMatrixLevels((prev) => ({ ...prev, [key]: String(clamped) }));
  };

  const handleFillBlankColumn = (skillId: string, valueStr: string) => {
    if (!matrixData || !valueStr) return;
    setMatrixLevels((prev) => {
      const next = { ...prev };
      for (const stu of matrixData.students) {
        const key = `${stu.id}:${skillId}`;
        if (!next[key]) {
          next[key] = valueStr;
        }
      }
      return next;
    });
  };

  const handleSaveMatrix = async () => {
    if (!canManageSkills || !matrixCenterId || dirtyMatrixEntries.length === 0) return;

    try {
      setMatrixSaving(true);
      const res = await bulkUpsertSkills({
        centerId: matrixCenterId,
        programId: matrixProgramId || undefined,
        assessedOn: matrixDate || undefined,
        entries: dirtyMatrixEntries,
      });
      toast.success({
        title: 'Class skill batch saved',
        description: `${res.createdCount} created, ${res.updatedCount} updated for ${res.assessedOn}.`,
      });
      await loadMatrix();
    } catch (err) {
      toast.error({
        title: 'Batch save failed',
        description: getApiErrorMessage(err, 'Failed to save class skill matrix.'),
      });
    } finally {
      setMatrixSaving(false);
    }
  };

  if (loading) {
    return (
      <PageWrapper title="Skills">
        <LoadingSpinner />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Skill Development Tracking">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === 'single'
                ? 'bg-brand-600 text-white'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <User size={15} />
            Single Student
          </button>
          <button
            type="button"
            onClick={() => setMode('matrix')}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === 'matrix'
                ? 'bg-brand-600 text-white'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <Grid size={15} />
            Class Skill Matrix
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} />
        </div>
      )}

      {mode === 'single' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="h-fit">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Student Selection</h2>
              <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center text-brand-600">
                <User size={16} />
              </div>
            </div>
            {students.length === 0 ? (
              <EmptyState title="No students" description="Add students before logging skills." />
            ) : (
              <div className="space-y-2">
                <select
                  aria-label="Select student"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}
                    </option>
                  ))}
                </select>
                {selectedStudent?.program?.name && (
                  <p className="text-xs text-neutral-500">
                    Program: <span className="font-medium text-neutral-700">{selectedStudent.program.name}</span>
                  </p>
                )}
              </div>
            )}

            {canManageSkills && (
              <div className="mt-6 pt-6 border-t border-neutral-100">
                <Button
                  variant="primary"
                  className="w-full flex items-center justify-center gap-2"
                  onClick={openCreateModal}
                  disabled={!selectedId || availableSkills.length === 0}
                >
                  <Plus size={18} /> Record Assessment
                </Button>
                {selectedId && availableSkills.length === 0 && (
                  <p className="mt-2 text-xs text-amber-700">
                    No active skill definitions configured for this student&apos;s program.
                  </p>
                )}
              </div>
            )}
          </Card>

          <div className="lg:col-span-2 space-y-6">
            <Card>
              <h2 className="text-lg font-semibold mb-6">Proficiency Records</h2>
              {detailLoading ? (
                <LoadingSpinner label="Loading skills…" />
              ) : skillsPayload.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[540px] overflow-y-auto pr-2">
                    {skillsPayload.map((skill) => {
                      const maxLevel =
                        skill.skill?.maxLevel && skill.skill.maxLevel > 0 ? skill.skill.maxLevel : 5;
                      const level = skill.level ?? 0;
                      const widthPct = Math.min(100, Math.max(0, Math.round((level / maxLevel) * 100)));

                      return (
                        <div
                          key={skill.id}
                          className="p-4 bg-white border border-neutral-200 rounded-xl shadow-sm hover:border-primary/50 transition-all group"
                        >
                          <div className="flex justify-between items-center mb-3 gap-2">
                            <span className="font-bold text-neutral-800 capitalize">
                              {skill.skill?.name ?? skill.skillName ?? 'Skill Area'}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-xs font-bold text-brand-700 bg-brand-50 px-2 py-1 rounded-full">
                                Level {level} / {maxLevel}
                              </span>
                              {canManageSkills && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs py-0.5 px-2 h-auto text-neutral-500 hover:text-brand-600"
                                    onClick={() => handleEdit(skill)}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs py-0.5 px-2 h-auto text-danger hover:text-danger hover:bg-danger/10"
                                    onClick={() => setDeleteTargetId(skill.id)}
                                  >
                                    Delete
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden mb-2">
                            <div
                              className="bg-brand-600 h-2 rounded-full transition-all duration-700"
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-neutral-400">
                            <span>{skill.assessedOn ? formatDate(skill.assessedOn, 'MMM d, yyyy') : 'Recently'}</span>
                            {skill.assessedByUser && <span>By: {skill.assessedByUser.fullName}</span>}
                          </div>
                          {skill.remarks && (
                            <p className="text-xs text-neutral-500 mt-3 p-2 bg-neutral-50 border border-neutral-100 rounded-lg italic">
                              &ldquo;{skill.remarks}&rdquo;
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <SkillProgressionChart records={skillsPayload} />
                </>
              ) : (
                <div className="py-20 flex flex-col items-center justify-center text-center border-2 border-dashed border-neutral-100 rounded-2xl bg-neutral-50/50">
                  <Megaphone size={32} className="text-neutral-400 mb-4" />
                  <h3 className="text-lg font-medium text-neutral-800">No assessments yet</h3>
                  <p className="text-sm text-neutral-500 mt-1">
                    {canManageSkills
                      ? 'Start by recording the first skill assessment.'
                      : 'No skill assessments have been recorded for this student yet.'}
                  </p>
                </div>
              )}
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-neutral-200 mb-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Center</label>
                <select
                  aria-label="Matrix Center"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                  value={matrixCenterId}
                  onChange={(e) => setMatrixCenterId(e.target.value)}
                >
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Program</label>
                <select
                  aria-label="Matrix Program"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                  value={matrixProgramId}
                  onChange={(e) => setMatrixProgramId(e.target.value)}
                >
                  {matrixProgramOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">
                  Batch / Cohort
                </label>
                <select
                  aria-label="Matrix Batch"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-white"
                  value={matrixBatchId}
                  onChange={(e) => setMatrixBatchId(e.target.value)}
                >
                  <option value="">All Students</option>
                  {matrixBatches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Assessment Date</label>
                <input
                  type="date"
                  aria-label="Matrix Assessment Date"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                  value={matrixDate}
                  onChange={(e) => setMatrixDate(e.target.value)}
                />
              </div>
            </div>

            {canManageSkills && (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="primary"
                  onClick={handleSaveMatrix}
                  disabled={matrixSaving || dirtyMatrixEntries.length === 0}
                  className="inline-flex items-center gap-2"
                >
                  <Save size={15} />
                  {matrixSaving
                    ? 'Saving Batch…'
                    : `Save Batch (${dirtyMatrixEntries.length})`}
                </Button>
              </div>
            )}
          </div>

          {matrixLoading ? (
            <LoadingSpinner label="Loading class skill matrix…" />
          ) : !matrixData || matrixData.students.length === 0 ? (
            <EmptyState
              title="No active students found"
              description="No active students match this center and program combination."
            />
          ) : matrixData.skills.length === 0 ? (
            <EmptyState
              title="No skill definitions configured"
              description="Add skill definitions for this program on the Programs page first."
            />
          ) : (
            <div className="overflow-x-auto border border-neutral-200 rounded-xl">
              <table className="min-w-full divide-y divide-neutral-200 text-sm">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="sticky left-0 z-10 bg-neutral-50 px-4 py-3 text-left text-xs font-semibold text-neutral-700 border-r border-neutral-200 min-w-[200px]">
                      Student ({matrixData.students.length})
                    </th>
                    {matrixData.skills.map((skill) => {
                      const maxLvl = skill.maxLevel ?? 5;
                      return (
                        <th
                          key={skill.id}
                          className="px-3 py-2 text-center text-xs font-semibold text-neutral-700 min-w-[140px]"
                        >
                          <div>{skill.name}</div>
                          <div className="text-[11px] font-normal text-neutral-500">
                            Scale 1–{maxLvl}
                          </div>
                          {canManageSkills && (
                            <select
                              aria-label={`Fill blanks for ${skill.name}`}
                              className="mt-1 rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[11px] font-normal text-neutral-600"
                              value=""
                              onChange={(e) => {
                                handleFillBlankColumn(skill.id, e.target.value);
                              }}
                            >
                              <option value="">Fill blanks…</option>
                              {Array.from({ length: maxLvl }, (_, idx) => idx + 1).map((lvl) => (
                                <option key={lvl} value={String(lvl)}>
                                  Set empty = {lvl}
                                </option>
                              ))}
                            </select>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 bg-white">
                  {matrixData.students.map((stu) => (
                    <tr key={stu.id} className="hover:bg-neutral-50/70">
                      <td className="sticky left-0 z-10 bg-white px-4 py-2.5 border-r border-neutral-200">
                        <div className="font-medium text-neutral-900">{stu.fullName}</div>
                        {stu.rollNumber && (
                          <div className="text-xs text-neutral-500">Roll: {stu.rollNumber}</div>
                        )}
                      </td>
                      {matrixData.skills.map((skill) => {
                        const key = `${stu.id}:${skill.id}`;
                        const val = matrixLevels[key] ?? '';
                        const savedVal = baselineLevels[key];
                        const isDirty = val !== '' && Number(val) !== savedVal;
                        const maxLvl = skill.maxLevel ?? 5;

                        return (
                          <td key={skill.id} className="px-3 py-2 text-center">
                            {maxLvl <= 10 ? (
                              <select
                                aria-label={`${stu.fullName} ${skill.name}`}
                                disabled={!canManageSkills}
                                value={val}
                                onChange={(e) =>
                                  handleMatrixCellChange(stu.id, skill.id, e.target.value, maxLvl)
                                }
                                className={`w-24 rounded-md border px-2 py-1 text-center text-sm outline-none ${
                                  isDirty
                                    ? 'border-brand-500 bg-brand-50/40 ring-1 ring-brand-400'
                                    : savedVal !== undefined
                                      ? 'border-emerald-300 bg-emerald-50/40'
                                      : 'border-neutral-300 bg-white'
                                }`}
                              >
                                <option value="">—</option>
                                {Array.from({ length: maxLvl }, (_, idx) => idx + 1).map((lvl) => (
                                  <option key={lvl} value={String(lvl)}>
                                    {lvl} / {maxLvl}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="number"
                                min={1}
                                max={maxLvl}
                                disabled={!canManageSkills}
                                aria-label={`${stu.fullName} ${skill.name}`}
                                placeholder="—"
                                value={val}
                                onChange={(e) =>
                                  handleMatrixCellChange(stu.id, skill.id, e.target.value, maxLvl)
                                }
                                className={`w-20 rounded-md border px-2 py-1 text-center text-sm outline-none ${
                                  isDirty
                                    ? 'border-brand-500 bg-brand-50/40 ring-1 ring-brand-400'
                                    : savedVal !== undefined
                                      ? 'border-emerald-300 bg-emerald-50/40'
                                      : 'border-neutral-300 bg-white'
                                }`}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={newSkillLog.id ? 'Edit Assessment' : 'Record Skill Assessment'}
      >
        <form onSubmit={handleSaveSkill} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Skill Area</label>
            <select
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
              value={newSkillLog.skillId}
              onChange={(e) => {
                const nextSkillId = e.target.value;
                const nextMax =
                  availableSkills.find((sd) => sd.id === nextSkillId)?.maxLevel ?? 5;
                setNewSkillLog((prev) => ({
                  ...prev,
                  skillId: nextSkillId,
                  level: Math.min(Math.max(prev.level, 1), nextMax),
                }));
              }}
              required
            >
              <option value="">Select a skill...</option>
              {modalSkillOptions.map((sd) => (
                <option key={sd.id} value={sd.id}>
                  {sd.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Assessment Date
            </label>
            <input
              type="date"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
              value={newSkillLog.assessedOn}
              onChange={(e) =>
                setNewSkillLog((prev) => ({ ...prev, assessedOn: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Proficiency Level ({newSkillLog.level}/{selectedMaxLevel})
            </label>
            <input
              type="range"
              min={1}
              max={selectedMaxLevel}
              step={1}
              className="w-full accent-brand-600"
              value={Math.min(newSkillLog.level, selectedMaxLevel)}
              onChange={(e) =>
                setNewSkillLog((prev) => ({
                  ...prev,
                  level: Number.parseInt(e.target.value, 10) || 1,
                }))
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Remarks</label>
            <textarea
              rows={3}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
              value={newSkillLog.remarks}
              onChange={(e) => setNewSkillLog((prev) => ({ ...prev, remarks: e.target.value }))}
              placeholder="Observations..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving || !newSkillLog.skillId}>
              {saving ? 'Saving...' : 'Save Assessment'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={deleteTargetId !== null}
        title="Delete Skill Assessment"
        message="Are you sure you want to delete this skill assessment? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTargetId(null)}
      />
    </PageWrapper>
  );
};
