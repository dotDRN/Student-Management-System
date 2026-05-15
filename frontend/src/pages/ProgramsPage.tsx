import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Input } from '../components/ui/Input';
import { BookOpen, Plus, ArrowLeft, GraduationCap, Building2, Users } from 'lucide-react';
import { listPrograms, getProgramDetails, createProgram } from '../services/centers.service';
import type { ProgramSummary } from '../types';

interface ProgramDetail {
  id: string;
  code: string;
  name: string;
  ageMin?: number | null;
  ageMax?: number | null;
  description?: string | null;
  studentCount: number;
  students: { id: string; fullName: string; rollNumber?: string | null; centerId: string }[];
  centerPrograms?: { center: { id: string; name: string; location?: string | null } }[];
}

export const ProgramsPage: React.FC = () => {
  const navigate = useNavigate();
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedProgram, setSelectedProgram] = useState<ProgramDetail | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formAgeMin, setFormAgeMin] = useState('');
  const [formAgeMax, setFormAgeMax] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPrograms();
      setPrograms(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load programs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSelectProgram = async (programId: string) => {
    setError(null);
    try {
      const detail = await getProgramDetails(programId);
      setSelectedProgram(detail);
    } catch {
      setError('Failed to load program details.');
    }
  };

  const handleCreateProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode.trim() || !formName.trim()) return;
    setFormSaving(true);
    try {
      await createProgram({
        code: formCode.trim(),
        name: formName.trim(),
        description: formDesc.trim() || undefined,
        ageMin: formAgeMin ? Number(formAgeMin) : undefined,
        ageMax: formAgeMax ? Number(formAgeMax) : undefined,
      });
      setFormCode(''); setFormName(''); setFormDesc(''); setFormAgeMin(''); setFormAgeMax('');
      setShowForm(false);
      await load();
    } catch {
      setError('Failed to create program.');
    } finally {
      setFormSaving(false);
    }
  };

  // Detail view
  if (selectedProgram) {
    const ageRange = selectedProgram.ageMin != null || selectedProgram.ageMax != null
      ? `${selectedProgram.ageMin ?? '—'} – ${selectedProgram.ageMax ?? '—'} years`
      : 'Not specified';

    return (
      <PageWrapper
        title={selectedProgram.name}
        actions={
          <Button variant="secondary" onClick={() => setSelectedProgram(null)}>
            <ArrowLeft size={16} className="mr-2" /> Back to Programs
          </Button>
        }
      >
        {error && <ErrorMessage message={error} />}

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
            <h3 className="text-md font-semibold text-neutral-900 mb-2 border-b border-neutral-100 pb-2">Purpose & Description</h3>
            <p className="text-sm text-neutral-700 leading-relaxed">{selectedProgram.description}</p>
          </Card>
        )}

        {/* Centers offering this program */}
        {selectedProgram.centerPrograms && selectedProgram.centerPrograms.length > 0 && (
          <Card className="mb-6">
            <h3 className="text-md font-semibold text-neutral-900 mb-3 border-b border-neutral-100 pb-2">
              <Building2 size={16} className="inline mr-2 text-blue-500" />Centers
            </h3>
            <div className="flex flex-wrap gap-2">
              {selectedProgram.centerPrograms.map((cp) => (
                <span key={cp.center.id} className="px-3 py-1 bg-blue-50 text-blue-800 rounded-full text-sm font-medium border border-blue-100">
                  {cp.center.name}
                </span>
              ))}
            </div>
          </Card>
        )}

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
                    <tr key={s.id} className="border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer" onClick={() => navigate(`/students/${s.id}`)}>
                      <td className="py-2 pr-3 font-medium text-neutral-900">{s.fullName}</td>
                      <td className="py-2 pr-3 text-neutral-600">{s.rollNumber || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </PageWrapper>
    );
  }

  // Grid view
  return (
    <PageWrapper
      title="Program Management"
      actions={
        <Button variant="primary" onClick={() => setShowForm(true)}>
          <Plus size={16} className="mr-2" /> Add Program
        </Button>
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
