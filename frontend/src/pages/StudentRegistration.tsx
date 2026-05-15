import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { ArrowLeft, Save } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { createStudent, getStudentById, updateStudent } from '../services/students.service';
import { listCenters, listPrograms } from '../services/centers.service';
import type { CenterSummary, ProgramSummary, Gender } from '../types';

export const StudentRegistration: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.currentUser);
  const selectedCenterId = useAuthStore((s) => s.selectedCenterId);
  const isEditMode = Boolean(id);
  const isAdmin = ['super_admin', 'center_admin', 'tech_admin'].includes(currentUser?.role || '');
  const defaultCenter = !isAdmin && selectedCenterId ? selectedCenterId : '';

  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [centers, setCenters] = useState<CenterSummary[]>([]);
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);

  const [formData, setFormData] = useState({
    fullName: '',
    rollNumber: '',
    dob: '',
    gender: '' as '' | Gender,
    guardianName: '',
    guardianPhone: '',
    centerId: defaultCenter,
    programId: '',
    enrollmentDate: new Date().toISOString().split('T')[0],
    stream: '',
    post12thChoice: '',
    collegeName: '',
    educationDiscontinued: false,
  });
  const [phoneError, setPhoneError] = useState<string | null>(null);

  useEffect(() => {
  let alive = true;
  const isTeacher = currentUser?.role === 'teacher' || currentUser?.role === 'staff';
  (async () => {
    try {
      const [c, p] = await Promise.all([listCenters(), listPrograms()]);
      console.log("Centers received by Component:", c);
      if (!alive) return;

      // For teachers, filter to only their assigned centers
      let filteredCenters = c;
      if (isTeacher && currentUser?.centerIds?.length) {
        filteredCenters = c.filter((center: any) =>
          currentUser.centerIds.includes(center.id)
        );
      }

      setCenters(filteredCenters);
      setPrograms(p);
      
      // Auto-select if there's only one center available
      if (filteredCenters.length === 1 && !formData.centerId) {
        setFormData(prev => ({ ...prev, centerId: filteredCenters[0].id }));
      }
    } catch (err) {
      if (alive) setError('Could not load centers or programs.');
    }
  })();
  return () => { alive = false; };
}, [currentUser?.centerIds]);

  useEffect(() => {
    if (!isEditMode || !id) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const s = await getStudentById(id);
        if (!alive) return;
        setFormData({
          fullName: s.fullName,
          rollNumber: s.rollNumber || '',
          dob: s.dob ? String(s.dob).slice(0, 10) : '',
          gender: (s.gender as Gender) || '',
          guardianName: s.guardianName || '',
          guardianPhone: s.guardianPhone || '',
          centerId: s.centerId,
          programId: s.programId,
          enrollmentDate: s.enrollmentDate ? String(s.enrollmentDate).slice(0, 10) : new Date().toISOString().split('T')[0],
          stream: (s as any).stream || '',
          post12thChoice: (s as any).post12thChoice || '',
          collegeName: (s as any).collegeName || '',
          educationDiscontinued: (s as any).educationDiscontinued || false,
        });
      } catch {
        if (alive) setError('Student not found.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, isEditMode]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData((prev) => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
    
    // Real-time phone validation
    if (name === 'guardianPhone') {
      if (value && !/^\d{10}$/.test(value)) {
        setPhoneError('Phone must be exactly 10 digits');
      } else {
        setPhoneError(null);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Final phone validation before submit
    if (formData.guardianPhone && !/^\d{10}$/.test(formData.guardianPhone)) {
      setPhoneError('Phone must be exactly 10 digits');
      return;
    }
    
    setSaving(true);
    setError(null);
    try {
      if (isEditMode && id) {
        await updateStudent(id, {
          fullName: formData.fullName,
          rollNumber: formData.rollNumber || undefined,
          dob: formData.dob || undefined,
          gender: formData.gender || undefined,
          guardianName: formData.guardianName || undefined,
          guardianPhone: formData.guardianPhone || undefined,
          stream: formData.stream || undefined,
          post12thChoice: formData.post12thChoice || undefined,
          collegeName: formData.collegeName || undefined,
          educationDiscontinued: formData.educationDiscontinued,
        });
        navigate(`/students/${id}`);
      } else {
        await createStudent({
          fullName: formData.fullName,
          rollNumber: formData.rollNumber || undefined,
          centerId: formData.centerId,
          programId: formData.programId,
          dob: formData.dob || undefined,
          gender: formData.gender || undefined,
          guardianName: formData.guardianName || undefined,
          guardianPhone: formData.guardianPhone || undefined,
          stream: formData.stream || undefined,
          post12thChoice: formData.post12thChoice || undefined,
          collegeName: formData.collegeName || undefined,
          educationDiscontinued: formData.educationDiscontinued,
        });
        navigate('/students');
      }
    } catch {
      setError('Save failed. Check required fields and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageWrapper title={isEditMode ? 'Edit Student' : 'Register Student'}>
        <LoadingSpinner />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      title={isEditMode ? 'Edit Student Profile' : 'Register New Student'}
      actions={
        <Button variant="ghost" onClick={() => navigate(-1)} className="text-neutral-600 bg-white">
          <ArrowLeft size={20} className="mr-2" /> Back
        </Button>
      }
    >
      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4 border-b border-neutral-100 pb-3">
            Personal Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Full Name"
              name="fullName"
              placeholder="Student full name"
              value={formData.fullName}
              onChange={handleChange}
              required
            />
            <Input
              label="Roll Number"
              name="rollNumber"
              placeholder="E.g. R-101"
              value={formData.rollNumber}
              onChange={handleChange}
            />
            <div className="flex gap-4 col-span-1 md:col-span-2">
              <Input
                label="Date of Birth"
                name="dob"
                type="date"
                className="flex-[2]"
                value={formData.dob}
                onChange={handleChange}
              />
              <div className="flex flex-col gap-1.5 flex-[1] touch-manipulation">
                <label className="text-xs uppercase tracking-wide text-neutral-600 font-medium">Gender</label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  className="flex h-12 md:h-11 w-full rounded-lg border border-neutral-300 bg-white px-4 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">—</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>
        </Card>

        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4 border-b border-neutral-100 pb-3">
            Guardian
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Guardian Name"
              name="guardianName"
              value={formData.guardianName}
              onChange={handleChange}
            />
            <div>
              <Input
                label="Guardian Phone"
                name="guardianPhone"
                type="tel"
                placeholder="10-digit number"
                maxLength={10}
                value={formData.guardianPhone}
                onChange={handleChange}
              />
              {phoneError && (
                <p className="text-xs text-danger mt-1">{phoneError}</p>
              )}
            </div>
          </div>
        </Card>

        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4 border-b border-neutral-100 pb-3">
            Career Tracking
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-wide text-neutral-600 font-medium">Stream</label>
              <input
                type="text"
                list="stream-options"
                name="stream"
                value={formData.stream}
                onChange={handleChange}
                placeholder="e.g. Science, Commerce, Arts"
                className="flex h-12 md:h-11 w-full rounded-lg border border-neutral-300 bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <datalist id="stream-options">
                <option value="Science" />
                <option value="Commerce" />
                <option value="Arts" />
                <option value="Vocational" />
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-wide text-neutral-600 font-medium">Post-12th Choice</label>
              <input
                type="text"
                list="post12th-options"
                name="post12thChoice"
                value={formData.post12thChoice}
                onChange={handleChange}
                placeholder="e.g. Engineering, Medical, Degree"
                className="flex h-12 md:h-11 w-full rounded-lg border border-neutral-300 bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <datalist id="post12th-options">
                <option value="Engineering" />
                <option value="Medical" />
                <option value="Degree College" />
                <option value="Diploma" />
                <option value="Work" />
              </datalist>
            </div>
            <Input
              label="College Name"
              name="collegeName"
              placeholder="e.g. IIT Bombay"
              value={formData.collegeName}
              onChange={handleChange}
            />
            <div className="flex items-center mt-6">
              <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 cursor-pointer">
                <input
                  type="checkbox"
                  name="educationDiscontinued"
                  checked={formData.educationDiscontinued}
                  onChange={handleChange}
                  className="rounded border-neutral-300 text-danger focus:ring-danger h-4 w-4"
                />
                Education Discontinued
              </label>
            </div>
          </div>
        </Card>

        <Card className="mb-8">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4 border-b border-neutral-100 pb-3">
            Program Enrollment
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-wide text-neutral-600 font-medium">
                Program <span className="text-danger">*</span>
              </label>
              <select
                name="programId"
                required
                disabled={isEditMode}
                value={formData.programId}
                onChange={handleChange}
                className="flex h-12 md:h-11 w-full rounded-lg border border-neutral-300 bg-white px-4 text-sm disabled:opacity-75 disabled:bg-neutral-100"
              >
                <option value="" disabled>
                  Select program…
                </option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-wide text-neutral-600 font-medium">
                Center <span className="text-danger">*</span>
              </label>
              <select
                name="centerId"
                required
                disabled={isEditMode}
                value={formData.centerId}
                onChange={handleChange}
                className="flex h-12 md:h-11 w-full rounded-lg border border-neutral-300 bg-white px-4 text-sm disabled:opacity-75 disabled:bg-neutral-100"
              >
                <option value="" disabled>
                  Select center…
                </option>
                {Array.isArray(centers) && centers.map((c) => (
  <option key={c.id} value={c.id}>
    {c.name}
  </option>
))}
              </select>
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-3 pb-8">
          <Button variant="secondary" type="button" onClick={() => navigate('/students')} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={saving}>
            <Save size={18} className="mr-2" />
            Save
          </Button>
        </div>
      </form>
    </PageWrapper>
  );
};
