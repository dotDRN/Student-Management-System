import React, { useEffect, useState } from 'react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { EmptyState } from '../components/ui/EmptyState';
import { getStudents } from '../services/students.service';
import type { Student } from '../types';
import api from '../services/api';
import { User, Megaphone, Plus } from 'lucide-react';
import { formatDate } from '../utils/date';
import { Modal } from '../components/ui/Modal';

export const Skills: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [skillsPayload, setSkillsPayload] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [skillDefs, setSkillDefs] = useState<any[]>([]);
  const [newSkillLog, setNewSkillLog] = useState({
    id: '',
    skillId: '',
    level: 3,
    remarks: ''
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getStudents({ limit: 200 });
        if (!alive) return;
        setStudents(res.students);
        if (res.students[0]) setSelectedId(res.students[0].id);
        
        const skRes = await api.get(`/skills/definitions`);
        if (alive) {
          setSkillDefs(skRes.data);
          if (skRes.data[0]) setNewSkillLog(s => ({ ...s, skillId: skRes.data[0].id }));
        }
      } catch (err) {
        if (alive) setError('Failed to load initial data.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    (async () => {
      setDetailLoading(true);
      setError(null);
      try {
        const res = await api.get(`/students/${selectedId}/skills`);
        if (alive) setSkillsPayload(res.data.data);
      } catch (err) {
        if (alive) {
          setSkillsPayload([]);
          setError('Failed to load skill records.');
        }
      } finally {
        if (alive) setDetailLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [selectedId]);

  const handleSaveSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !newSkillLog.skillId) return;
    
    try {
      setDetailLoading(true);
      if (newSkillLog.id) {
        // Edit existing
        await api.put(`/students/skills/${newSkillLog.id}`, {
          skillId: newSkillLog.skillId,
          level: newSkillLog.level,
          remarks: newSkillLog.remarks
        });
      } else {
        // Create new
        await api.post(`/students/${selectedId}/skills`, {
          skillId: newSkillLog.skillId,
          level: newSkillLog.level,
          remarks: newSkillLog.remarks,
          centerId: students.find(s => s.id === selectedId)?.centerId
        });
      }
      setIsModalOpen(false);
      const res = await api.get(`/students/${selectedId}/skills`);
      setSkillsPayload(res.data.data);
    } catch (err) {
      console.error(err);
      setError('Failed to save skill assessment.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleEdit = (skill: any) => {
    setNewSkillLog({
      id: skill.id,
      skillId: skill.skillId || skill.skill?.id || '',
      level: skill.level || 3,
      remarks: skill.remarks || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (skillId: string) => {
    if (!selectedId || !window.confirm('Are you sure you want to delete this skill assessment?')) return;
    try {
      setDetailLoading(true);
      await api.delete(`/students/skills/${skillId}`);
      const res = await api.get(`/students/${selectedId}/skills`);
      setSkillsPayload(res.data.data);
    } catch (err) {
      console.error(err);
      setError('Failed to delete skill assessment.');
    } finally {
      setDetailLoading(false);
    }
  };

  if (loading) return <PageWrapper title="Skills"><LoadingSpinner /></PageWrapper>;

  return (
    <PageWrapper title="Skill Development Tracking">
      {error && <div className="mb-4"><ErrorMessage message={error} /></div>}

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
            <select
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.fullName}</option>
              ))}
            </select>
          )}
          <div className="mt-6 pt-6 border-t border-neutral-100">
             <Button variant="primary" className="w-full flex items-center justify-center gap-2" onClick={() => {
                setNewSkillLog({ id: '', skillId: skillDefs[0]?.id || '', level: 3, remarks: '' });
                setIsModalOpen(true);
             }} disabled={!selectedId}>
                <Plus size={18} /> Record Assessment
             </Button>
          </div>
        </Card>

        <div className="lg:col-span-2">
          <Card className="h-full">
            <h2 className="text-lg font-semibold mb-6">Proficiency Records</h2>
            {detailLoading ? (
              <LoadingSpinner label="Loading skills…" />
            ) : Array.isArray(skillsPayload) && skillsPayload.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto pr-2">
                {skillsPayload.map((skill: any, i: number) => (
                  <div key={i} className="p-4 bg-white border border-neutral-200 rounded-xl shadow-sm hover:border-primary/50 transition-all group">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-bold text-neutral-800 capitalize">{skill.skill?.name || 'Skill Area'}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-brand-700 bg-brand-50 px-2 py-1 rounded-full">Level {skill.level || 0} / 5</span>
                        <Button variant="ghost" size="sm" className="text-xs py-0.5 px-2 h-auto text-neutral-500 hover:text-brand-600" onClick={() => handleEdit(skill)}>Edit</Button>
                        <Button variant="ghost" size="sm" className="text-xs py-0.5 px-2 h-auto text-danger hover:text-danger hover:bg-danger/10" onClick={() => handleDelete(skill.id)}>Delete</Button>
                      </div>
                    </div>
                    <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden mb-2">
                      <div className="bg-brand-600 h-2 rounded-full transition-all duration-1000" style={{ width: `${(skill.level || 0) * 20}%` }}></div>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-neutral-400">
                       <span>{skill.assessedOn ? formatDate(new Date(skill.assessedOn), 'MMM d, yyyy') : 'Recently'}</span>
                       {skill.assessedByUser && <span>By: {skill.assessedByUser.fullName}</span>}
                    </div>
                    {skill.remarks && <p className="text-xs text-neutral-500 mt-3 p-2 bg-neutral-50 border border-neutral-100 rounded-lg italic">"{skill.remarks}"</p>}
                  </div>
                ))}
              </div>
            ) : (
               <div className="py-20 flex flex-col items-center justify-center text-center border-2 border-dashed border-neutral-100 rounded-2xl bg-neutral-50/50">
                  <Megaphone size={32} className="text-neutral-400 mb-4" />
                  <h3 className="text-lg font-medium text-neutral-800">No assessments yet</h3>
                  <p className="text-sm text-neutral-500 mt-1">Start by recording the first skill assessment.</p>
               </div>
            )}
          </Card>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={newSkillLog.id ? "Edit Assessment" : "Record Skill Assessment"}>
        <form onSubmit={handleSaveSkill} className="space-y-4">
           <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Skill Area</label>
              <select className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none" value={newSkillLog.skillId} onChange={e => setNewSkillLog({ ...newSkillLog, skillId: e.target.value })} required>
                 <option value="">Select a skill...</option>
                 {skillDefs.map(sd => <option key={sd.id} value={sd.id}>{sd.name}</option>)}
              </select>
           </div>
           <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Proficiency Level ({newSkillLog.level}/5)</label>
              <input type="range" min="1" max="5" step="1" className="w-full accent-brand-600" value={newSkillLog.level} onChange={e => setNewSkillLog({ ...newSkillLog, level: parseInt(e.target.value) })} />
           </div>
           <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Remarks</label>
              <textarea rows={3} className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none" value={newSkillLog.remarks} onChange={e => setNewSkillLog({ ...newSkillLog, remarks: e.target.value })} placeholder="Observations..." />
           </div>
           <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Save Assessment</Button>
           </div>
        </form>
      </Modal>
    </PageWrapper>
  );
};
