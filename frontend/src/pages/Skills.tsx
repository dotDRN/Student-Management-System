import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Megaphone, Plus, User } from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { usePermission } from '../hooks/usePermission';
import { useToast } from '../hooks/useToast';
import { getApiErrorMessage } from '../services/api';
import { getStudents } from '../services/students.service';
import {
  addSkill,
  deleteSkill,
  getSkillsByStudent,
  listSkillDefinitions,
  updateSkill,
} from '../services/skills.service';
import type { SkillDefinition, SkillRecord, Student } from '../types';
import { formatDate } from '../utils/date';

interface SkillFormState {
  id: string;
  skillId: string;
  level: number;
  remarks: string;
}

export const Skills: React.FC = () => {
  const { can } = usePermission();
  const toast = useToast();
  const canManageSkills = can('manage', 'skills');

  const [students, setStudents] = useState<Student[]>([]);
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
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [studentRes, defsRes] = await Promise.all([
          getStudents({ limit: 200 }),
          listSkillDefinitions(),
        ]);
        if (!alive) return;
        setStudents(studentRes.students);
        setSkillDefs(defsRes);
        if (studentRes.students[0]) {
          setSelectedId(studentRes.students[0].id);
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
    void loadStudentSkills(selectedId);
  }, [selectedId, loadStudentSkills]);

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

  if (loading) {
    return (
      <PageWrapper title="Skills">
        <LoadingSpinner />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Skill Development Tracking">
      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} />
        </div>
      )}

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

        <div className="lg:col-span-2">
          <Card className="h-full">
            <h2 className="text-lg font-semibold mb-6">Proficiency Records</h2>
            {detailLoading ? (
              <LoadingSpinner label="Loading skills…" />
            ) : skillsPayload.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto pr-2">
                {skillsPayload.map((skill) => {
                  const maxLevel = skill.skill?.maxLevel && skill.skill.maxLevel > 0 ? skill.skill.maxLevel : 5;
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
