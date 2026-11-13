import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Input } from '../components/ui/Input';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import {
  BookOpen,
  Plus,
  ArrowLeft,
  GraduationCap,
  Building2,
  Users,
  Pencil,
  Trash2,
  BookMarked,
  Award,
  X,
} from 'lucide-react';
import {
  listPrograms,
  getProgramDetails,
  createProgram,
  updateProgram,
  listCenters,
  assignProgramToCenter,
  removeProgramFromCenter,
  createProgramSubject,
  updateProgramSubject,
  deleteProgramSubject,
  createSkillDefinition,
  updateSkillDefinition,
  deleteSkillDefinition,
  type ProgramDetail,
  type ProgramSubjectItem,
  type SkillDefinitionItem,
} from '../services/centers.service';
import { getApiErrorMessage } from '../services/api';
import { usePermission } from '../hooks/usePermission';
import { useToast } from '../hooks/useToast';
import type { CenterSummary, ProgramSummary } from '../types';

type ConfirmAction =
  | { type: 'unlink_center'; centerId: string; centerName: string; programId: string }
  | { type: 'delete_subject'; programId: string; subjectId: string; subjectName: string }
  | { type: 'delete_skill'; programId: string; skillId: string; skillName: string };

export const ProgramsPage: React.FC = () => {
  const navigate = useNavigate();
  const { can } = usePermission();
  const toast = useToast();
  const canManageCenters = can('manage', 'centers');

  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [allCenters, setAllCenters] = useState<CenterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedProgram, setSelectedProgram] = useState<ProgramDetail | null>(null);

  // Add program form
  const [showForm, setShowForm] = useState(false);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formAgeMin, setFormAgeMin] = useState('');
  const [formAgeMax, setFormAgeMax] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  // Edit program form
  const [showEditProgram, setShowEditProgram] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAgeMin, setEditAgeMin] = useState('');
  const [editAgeMax, setEditAgeMax] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Link center
  const [linkCenterId, setLinkCenterId] = useState('');
  const [linkingCenter, setLinkingCenter] = useState(false);

  // Subject CRUD
  const [showSubjectForm, setShowSubjectForm] = useState(false);
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState('');
  const [subjectMaxMarks, setSubjectMaxMarks] = useState('100');
  const [savingSubject, setSavingSubject] = useState(false);

  // Skill Definition CRUD
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [skillName, setSkillName] = useState('');
  const [skillMaxLevel, setSkillMaxLevel] = useState('5');
  const [skillDescription, setSkillDescription] = useState('');
  const [savingSkill, setSavingSkill] = useState(false);

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [programData, centerData] = await Promise.all([
        listPrograms(),
        canManageCenters ? listCenters().catch(() => [] as CenterSummary[]) : Promise.resolve([] as CenterSummary[]),
      ]);
      setPrograms(Array.isArray(programData) ? programData : []);
      setAllCenters(Array.isArray(centerData) ? centerData : []);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load programs.'));
    } finally {
      setLoading(false);
    }
  }, [canManageCenters]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshProgramDetail = useCallback(async (programId: string) => {
    const detail = await getProgramDetails(programId);
    setSelectedProgram(detail);
    return detail;
  }, []);

  const resetDetailForms = () => {
    setShowEditProgram(false);
    setShowSubjectForm(false);
    setEditingSubjectId(null);
    setShowSkillForm(false);
    setEditingSkillId(null);
    setLinkCenterId('');
  };

  const handleSelectProgram = async (programId: string) => {
    setError(null);
    resetDetailForms();
    try {
      await refreshProgramDetail(programId);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load program details.'));
    }
  };

  const handleCreateProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode.trim() || !formName.trim()) return;
    const minAge = formAgeMin !== '' ? Number(formAgeMin) : undefined;
    const maxAge = formAgeMax !== '' ? Number(formAgeMax) : undefined;
    if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) {
      setError('Minimum age cannot exceed maximum age.');
      return;
    }
    setFormSaving(true);
    setError(null);
    try {
      await createProgram({
        code: formCode.trim(),
        name: formName.trim(),
        description: formDesc.trim() || undefined,
        ageMin: minAge,
        ageMax: maxAge,
      });
      setFormCode('');
      setFormName('');
      setFormDesc('');
      setFormAgeMin('');
      setFormAgeMax('');
      setShowForm(false);
      toast.success({ title: 'Program created' });
      await load();
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Failed to create program.');
      setError(msg);
      toast.error({ title: 'Create program failed', description: msg });
    } finally {
      setFormSaving(false);
    }
  };

  const openEditProgram = () => {
    if (!selectedProgram) return;
    setEditName(selectedProgram.name);
    setEditDesc(selectedProgram.description ?? '');
    setEditAgeMin(selectedProgram.ageMin != null ? String(selectedProgram.ageMin) : '');
    setEditAgeMax(selectedProgram.ageMax != null ? String(selectedProgram.ageMax) : '');
    setShowEditProgram(true);
  };

  const handleUpdateProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProgram || !editName.trim()) return;
    const ageMin = editAgeMin !== '' ? Number(editAgeMin) : null;
    const ageMax = editAgeMax !== '' ? Number(editAgeMax) : null;
    if (ageMin !== null && ageMax !== null && ageMin > ageMax) {
      toast.error({ title: 'Invalid age range', description: 'Minimum age cannot exceed maximum age.' });
      return;
    }
    setEditSaving(true);
    try {
      await updateProgram(selectedProgram.id, {
        name: editName.trim(),
        description: editDesc.trim() || null,
        ageMin,
        ageMax,
      });
      setShowEditProgram(false);
      toast.success({ title: 'Program updated' });
      await Promise.all([refreshProgramDetail(selectedProgram.id), load()]);
    } catch (err) {
      toast.error({
        title: 'Update program failed',
        description: getApiErrorMessage(err, 'Failed to update program.'),
      });
    } finally {
      setEditSaving(false);
    }
  };

  const handleLinkCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProgram || !linkCenterId) return;
    setLinkingCenter(true);
    try {
      await assignProgramToCenter(linkCenterId, selectedProgram.id);
      setLinkCenterId('');
      toast.success({ title: 'Center linked to program' });
      await refreshProgramDetail(selectedProgram.id);
    } catch (err) {
      toast.error({
        title: 'Link center failed',
        description: getApiErrorMessage(err, 'Failed to link center.'),
      });
    } finally {
      setLinkingCenter(false);
    }
  };

  const startCreateSubject = () => {
    setEditingSubjectId(null);
    setSubjectName('');
    setSubjectMaxMarks('100');
    setShowSubjectForm(true);
  };

  const startEditSubject = (subject: ProgramSubjectItem) => {
    setEditingSubjectId(subject.id);
    setSubjectName(subject.name);
    setSubjectMaxMarks(String(Number(subject.maxMarks || 100)));
    setShowSubjectForm(true);
  };

  const handleSaveSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProgram || !subjectName.trim()) return;
    const maxMarksNum = Number(subjectMaxMarks);
    if (!Number.isFinite(maxMarksNum) || maxMarksNum <= 0 || maxMarksNum > 9999.99) {
      toast.error({ title: 'Invalid max marks', description: 'Enter a value between 1 and 9999.99.' });
      return;
    }
    setSavingSubject(true);
    try {
      if (editingSubjectId) {
        await updateProgramSubject(selectedProgram.id, editingSubjectId, {
          name: subjectName.trim(),
          maxMarks: maxMarksNum,
        });
        toast.success({ title: 'Subject updated' });
      } else {
        await createProgramSubject(selectedProgram.id, {
          name: subjectName.trim(),
          maxMarks: maxMarksNum,
        });
        toast.success({ title: 'Subject added' });
      }
      setShowSubjectForm(false);
      setEditingSubjectId(null);
      setSubjectName('');
      setSubjectMaxMarks('100');
      await refreshProgramDetail(selectedProgram.id);
    } catch (err) {
      toast.error({
        title: editingSubjectId ? 'Update subject failed' : 'Add subject failed',
        description: getApiErrorMessage(err, 'Failed to save subject.'),
      });
    } finally {
      setSavingSubject(false);
    }
  };

  const startCreateSkill = () => {
    setEditingSkillId(null);
    setSkillName('');
    setSkillMaxLevel('5');
    setSkillDescription('');
    setShowSkillForm(true);
  };

  const startEditSkill = (skill: SkillDefinitionItem) => {
    setEditingSkillId(skill.id);
    setSkillName(skill.name);
    setSkillMaxLevel(String(skill.maxLevel || 5));
    setSkillDescription(skill.description ?? '');
    setShowSkillForm(true);
  };

  const handleSaveSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProgram || !skillName.trim()) return;
    const maxLevelNum = Number(skillMaxLevel);
    if (!Number.isInteger(maxLevelNum) || maxLevelNum < 1 || maxLevelNum > 20) {
      toast.error({ title: 'Invalid max level', description: 'Max level must be an integer between 1 and 20.' });
      return;
    }
    setSavingSkill(true);
    try {
      if (editingSkillId) {
        await updateSkillDefinition(selectedProgram.id, editingSkillId, {
          name: skillName.trim(),
          maxLevel: maxLevelNum,
          description: skillDescription.trim() || null,
        });
        toast.success({ title: 'Skill definition updated' });
      } else {
        await createSkillDefinition(selectedProgram.id, {
          name: skillName.trim(),
          maxLevel: maxLevelNum,
          description: skillDescription.trim() || null,
        });
        toast.success({ title: 'Skill definition added' });
      }
      setShowSkillForm(false);
      setEditingSkillId(null);
      setSkillName('');
      setSkillMaxLevel('5');
      setSkillDescription('');
      await refreshProgramDetail(selectedProgram.id);
    } catch (err) {
      toast.error({
        title: editingSkillId ? 'Update skill failed' : 'Add skill failed',
        description: getApiErrorMessage(err, 'Failed to save skill definition.'),
      });
    } finally {
      setSavingSkill(false);
    }
  };

  const executeConfirmedAction = async () => {
    if (!confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    try {
      if (action.type === 'unlink_center') {
        await removeProgramFromCenter(action.centerId, action.programId);
        toast.success({ title: 'Center unlinked', description: `${action.centerName} was removed from this program.` });
        await refreshProgramDetail(action.programId);
      } else if (action.type === 'delete_subject') {
        const res = await deleteProgramSubject(action.programId, action.subjectId);
        toast.success({
          title: res.deactivated ? 'Subject deactivated' : 'Subject deleted',
          description: res.deactivated
            ? `"${action.subjectName}" had existing exam scores, so it was archived instead of deleted.`
            : `"${action.subjectName}" has been removed.`,
        });
        await refreshProgramDetail(action.programId);
      } else if (action.type === 'delete_skill') {
        const res = await deleteSkillDefinition(action.programId, action.skillId);
        toast.success({
          title: res.deactivated ? 'Skill deactivated' : 'Skill deleted',
          description: res.deactivated
            ? `"${action.skillName}" had recorded skill assessments, so it was archived cleanly.`
            : `"${action.skillName}" has been removed.`,
        });
        await refreshProgramDetail(action.programId);
      }
    } catch (err) {
      toast.error({
        title: 'Action failed',
        description: getApiErrorMessage(err, 'Unable to complete action.'),
      });
    }
  };

  const unlinkedCenters = useMemo(() => {
    if (!selectedProgram) return [];
    const linkedIds = new Set(
      (selectedProgram.centerPrograms ?? []).map((cp) => cp.center.id),
    );
    return allCenters.filter((c) => !linkedIds.has(c.id));
  }, [allCenters, selectedProgram]);

  const confirmCopy = (() => {
    if (!confirmAction) return { title: '', message: '', confirmLabel: 'Confirm' };
    if (confirmAction.type === 'unlink_center') {
      return {
        title: 'Unlink Center',
        message: `Remove "${confirmAction.centerName}" from this program? Blocked if active students are enrolled there.`,
        confirmLabel: 'Unlink Center',
      };
    }
    if (confirmAction.type === 'delete_subject') {
      return {
        title: 'Remove Program Subject',
        message: `Remove "${confirmAction.subjectName}"? If historical exam scores exist, it will be deactivated safely so past reports remain intact.`,
        confirmLabel: 'Remove Subject',
      };
    }
    return {
      title: 'Remove Skill Definition',
      message: `Remove "${confirmAction.skillName}"? If assessment logs exist, it will be deactivated safely so student records remain intact.`,
      confirmLabel: 'Remove Skill',
    };
  })();

  // Detail view
  if (selectedProgram) {
    const ageRange =
      selectedProgram.ageMin != null || selectedProgram.ageMax != null
        ? `${selectedProgram.ageMin ?? '—'} – ${selectedProgram.ageMax ?? '—'} years`
        : 'Not specified';

    const subjects = selectedProgram.subjects ?? [];
    const skillDefinitions = selectedProgram.skillDefinitions ?? [];

    return (
      <PageWrapper
        title={selectedProgram.name}
        actions={
          <div className="flex flex-wrap gap-2">
            {canManageCenters && (
              <Button variant="secondary" onClick={openEditProgram}>
                <Pencil size={15} className="mr-1.5" /> Edit Program
              </Button>
            )}
            <Button variant="secondary" onClick={() => setSelectedProgram(null)}>
              <ArrowLeft size={16} className="mr-2" /> Back to Programs
            </Button>
          </div>
        }
      >
        {error && <div className="mb-4"><ErrorMessage message={error} /></div>}

        {showEditProgram && canManageCenters && (
          <Card className="mb-6 border-2 border-brand-200 bg-brand-50/30">
            <h3 className="text-md font-semibold text-neutral-900 mb-4">Edit Program Details</h3>
            <form onSubmit={(e) => void handleUpdateProgram(e)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Program Code" value={selectedProgram.code} disabled />
              <Input
                label="Program Name *"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
              <Input
                label="Min Age"
                type="number"
                value={editAgeMin}
                onChange={(e) => setEditAgeMin(e.target.value)}
              />
              <Input
                label="Max Age"
                type="number"
                value={editAgeMax}
                onChange={(e) => setEditAgeMax(e.target.value)}
              />
              <div className="sm:col-span-2">
                <Input
                  label="Description"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2 flex gap-2 justify-end">
                <Button variant="secondary" type="button" onClick={() => setShowEditProgram(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" isLoading={editSaving}>
                  Save Changes
                </Button>
              </div>
            </form>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card className="py-4 text-center">
            <p className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Code</p>
            <p className="text-lg font-bold text-neutral-900">{selectedProgram.code}</p>
          </Card>
          <Card className="py-4 text-center">
            <p className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Age Category</p>
            <p className="text-lg font-bold text-neutral-900">{ageRange}</p>
          </Card>
          <Card className="py-4 text-center">
            <GraduationCap size={20} className="mx-auto text-emerald-500 mb-1" />
            <p className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Total Students</p>
            <p className="text-2xl font-bold text-neutral-900">{selectedProgram.studentCount}</p>
          </Card>
        </div>

        {selectedProgram.description && (
          <Card className="mb-6">
            <h3 className="text-md font-semibold text-neutral-900 mb-2 border-b border-neutral-100 pb-2">
              Purpose & Description
            </h3>
            <p className="text-sm text-neutral-700 leading-relaxed">{selectedProgram.description}</p>
          </Card>
        )}

        {/* Centers offering this program */}
        <Card className="mb-6">
          <h3 className="text-md font-semibold text-neutral-900 mb-3 border-b border-neutral-100 pb-2">
            <Building2 size={16} className="inline mr-2 text-blue-500" />Centers Offering This Program
          </h3>
          {selectedProgram.centerPrograms && selectedProgram.centerPrograms.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedProgram.centerPrograms.map((cp) => (
                <span
                  key={cp.center.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-800 rounded-full text-sm font-medium border border-blue-100"
                >
                  {cp.center.name}
                  {canManageCenters && (
                    <button
                      type="button"
                      aria-label={`Unlink ${cp.center.name}`}
                      onClick={() =>
                        setConfirmAction({
                          type: 'unlink_center',
                          centerId: cp.center.id,
                          centerName: cp.center.name,
                          programId: selectedProgram.id,
                        })
                      }
                      className="ml-0.5 rounded-full p-0.5 text-blue-600 hover:bg-blue-100 hover:text-blue-900"
                    >
                      <X size={13} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500 mb-4">Not linked to any centers yet.</p>
          )}

          {canManageCenters && (
            <form onSubmit={(e) => void handleLinkCenter(e)} className="flex flex-wrap items-end gap-3 pt-2 border-t border-neutral-100">
              <div className="flex-1 min-w-[220px]">
                <label className="block text-xs font-medium text-neutral-600 mb-1">Link to Center</label>
                <select
                  value={linkCenterId}
                  onChange={(e) => setLinkCenterId(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Select center...</option>
                  {unlinkedCenters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" variant="primary" disabled={!linkCenterId} isLoading={linkingCenter}>
                <Plus size={15} className="mr-1" /> Link Center
              </Button>
            </form>
          )}
        </Card>

        {/* Curriculum Subjects */}
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b border-neutral-100 pb-2">
            <h3 className="text-md font-semibold text-neutral-900 flex items-center gap-2">
              <BookMarked size={16} className="text-indigo-500" /> Exam Subjects ({subjects.length})
            </h3>
            {canManageCenters && (
              <Button variant="secondary" size="sm" onClick={startCreateSubject}>
                <Plus size={14} className="mr-1" /> Add Subject
              </Button>
            )}
          </div>

          {showSubjectForm && canManageCenters && (
            <form
              onSubmit={(e) => void handleSaveSubject(e)}
              className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end p-3 mb-4 rounded-xl bg-neutral-50 border border-neutral-200"
            >
              <Input
                label="Subject Name *"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                placeholder="e.g. Mathematics"
                required
              />
              <Input
                label="Max Marks *"
                type="number"
                min={1}
                max={9999.99}
                step="0.01"
                value={subjectMaxMarks}
                onChange={(e) => setSubjectMaxMarks(e.target.value)}
                required
              />
              <div className="flex gap-2 justify-end">
                <Button variant="secondary" type="button" onClick={() => setShowSubjectForm(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" isLoading={savingSubject}>
                  {editingSubjectId ? 'Update' : 'Add'}
                </Button>
              </div>
            </form>
          )}

          {subjects.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-4">
              No subjects configured yet. Add subjects to enable exam sheets and grading.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-500">
                    <th className="py-2 pr-3 font-medium">Subject</th>
                    <th className="py-2 pr-3 font-medium">Max Marks</th>
                    {canManageCenters && <th className="py-2 text-right font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((sub) => (
                    <tr key={sub.id} className="border-b border-neutral-100">
                      <td className="py-2.5 pr-3 font-medium text-neutral-900">{sub.name}</td>
                      <td className="py-2.5 pr-3 text-neutral-600">{Number(sub.maxMarks)}</td>
                      {canManageCenters && (
                        <td className="py-2.5 text-right space-x-2">
                          <Button variant="secondary" size="sm" onClick={() => startEditSubject(sub)}>
                            <Pencil size={13} className="mr-1" /> Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() =>
                              setConfirmAction({
                                type: 'delete_subject',
                                programId: selectedProgram.id,
                                subjectId: sub.id,
                                subjectName: sub.name,
                              })
                            }
                          >
                            <Trash2 size={13} />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Skill Definitions */}
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b border-neutral-100 pb-2">
            <h3 className="text-md font-semibold text-neutral-900 flex items-center gap-2">
              <Award size={16} className="text-amber-500" /> Skill Definitions ({skillDefinitions.length})
            </h3>
            {canManageCenters && (
              <Button variant="secondary" size="sm" onClick={startCreateSkill}>
                <Plus size={14} className="mr-1" /> Add Skill
              </Button>
            )}
          </div>

          {showSkillForm && canManageCenters && (
            <form
              onSubmit={(e) => void handleSaveSkill(e)}
              className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end p-3 mb-4 rounded-xl bg-neutral-50 border border-neutral-200"
            >
              <Input
                label="Skill Name *"
                value={skillName}
                onChange={(e) => setSkillName(e.target.value)}
                placeholder="e.g. Phonics Fluency"
                required
              />
              <Input
                label="Max Level *"
                type="number"
                min={1}
                max={20}
                value={skillMaxLevel}
                onChange={(e) => setSkillMaxLevel(e.target.value)}
                required
              />
              <Input
                label="Description"
                value={skillDescription}
                onChange={(e) => setSkillDescription(e.target.value)}
                placeholder="Assessment rubric notes"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="secondary" type="button" onClick={() => setShowSkillForm(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" isLoading={savingSkill}>
                  {editingSkillId ? 'Update' : 'Add'}
                </Button>
              </div>
            </form>
          )}

          {skillDefinitions.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-4">
              No skill definitions configured yet. Add skills to track student skill proficiency.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-500">
                    <th className="py-2 pr-3 font-medium">Skill</th>
                    <th className="py-2 pr-3 font-medium">Max Level</th>
                    <th className="py-2 pr-3 font-medium">Description</th>
                    {canManageCenters && <th className="py-2 text-right font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {skillDefinitions.map((skill) => (
                    <tr key={skill.id} className="border-b border-neutral-100">
                      <td className="py-2.5 pr-3 font-medium text-neutral-900">{skill.name}</td>
                      <td className="py-2.5 pr-3 text-neutral-600">Level 1 – {skill.maxLevel}</td>
                      <td className="py-2.5 pr-3 text-neutral-500">{skill.description || '—'}</td>
                      {canManageCenters && (
                        <td className="py-2.5 text-right space-x-2">
                          <Button variant="secondary" size="sm" onClick={() => startEditSkill(skill)}>
                            <Pencil size={13} className="mr-1" /> Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() =>
                              setConfirmAction({
                                type: 'delete_skill',
                                programId: selectedProgram.id,
                                skillId: skill.id,
                                skillName: skill.name,
                              })
                            }
                          >
                            <Trash2 size={13} />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Students list */}
        <Card className="mb-6">
          <h3 className="text-md font-semibold text-neutral-900 mb-3 border-b border-neutral-100 pb-2">
            <Users size={16} className="inline mr-2 text-emerald-500" />Enrolled Students
          </h3>
          {selectedProgram.students.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-4">No students enrolled.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-500">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Roll No</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedProgram.students.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer"
                      onClick={() => navigate(`/students/${s.id}`)}
                    >
                      <td className="py-2 pr-3 font-medium text-neutral-900">{s.fullName}</td>
                      <td className="py-2 pr-3 text-neutral-600">{s.rollNumber || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <ConfirmModal
          open={confirmAction !== null}
          title={confirmCopy.title}
          message={confirmCopy.message}
          confirmLabel={confirmCopy.confirmLabel}
          variant="danger"
          onConfirm={() => void executeConfirmedAction()}
          onCancel={() => setConfirmAction(null)}
        />
      </PageWrapper>
    );
  }

  // Grid view
  return (
    <PageWrapper
      title="Program Management"
      actions={
        canManageCenters ? (
          <Button variant="primary" onClick={() => setShowForm(true)}>
            <Plus size={16} className="mr-2" /> Add Program
          </Button>
        ) : undefined
      }
    >
      {error && <div className="mb-4"><ErrorMessage message={error} /></div>}

      {showForm && (
        <Card className="mb-6 border-2 border-brand-200 bg-brand-50/30">
          <h3 className="text-md font-semibold text-neutral-900 mb-4">New Program</h3>
          <form onSubmit={(e) => void handleCreateProgram(e)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Program Code *" value={formCode} onChange={(e) => setFormCode(e.target.value)} required placeholder="e.g. PRI, SEC" />
            <Input label="Program Name *" value={formName} onChange={(e) => setFormName(e.target.value)} required placeholder="e.g. Primary Education" />
            <Input label="Min Age" type="number" value={formAgeMin} onChange={(e) => setFormAgeMin(e.target.value)} placeholder="e.g. 6" />
            <Input label="Max Age" type="number" value={formAgeMax} onChange={(e) => setFormAgeMax(e.target.value)} placeholder="e.g. 14" />
            <div className="sm:col-span-2">
              <Input label="Description" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Purpose of this program..." />
            </div>
            <div className="sm:col-span-2 flex gap-2 justify-end">
              <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button variant="primary" type="submit" isLoading={formSaving}>Create Program</Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : programs.length === 0 ? (
        <Card className="py-12 text-center">
          <BookOpen size={48} className="mx-auto text-neutral-300 mb-3" />
          <p className="text-neutral-500">No programs found. Add one to get started.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {programs.map((p) => (
            <Card
              key={p.id}
              className="cursor-pointer hover:shadow-lg hover:border-brand-300 transition-all duration-200 group"
              onClick={() => void handleSelectProgram(p.id)}
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center shrink-0 group-hover:from-emerald-200 group-hover:to-emerald-300 transition-colors">
                  <BookOpen size={24} className="text-emerald-700" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-neutral-900 group-hover:text-emerald-800 transition-colors">{p.name}</h3>
                  <p className="text-xs text-neutral-500 mt-0.5">Code: {p.code}</p>
                  {p.description && (
                    <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{p.description}</p>
                  )}
                  {(p.ageMin != null || p.ageMax != null) && (
                    <p className="text-xs text-neutral-400 mt-1">Age: {p.ageMin ?? '—'} – {p.ageMax ?? '—'}</p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageWrapper>
  );
};
