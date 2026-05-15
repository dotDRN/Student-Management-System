import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { FieldRenderer } from '../../components/forms/FieldRenderer';
import { getFormTemplate, submitForm } from '../../services/forms.service';
import { getStudents } from '../../services/students.service';
import { listCenters } from '../../services/centers.service';
import { apiSchemaToUiFields, type DynamicFormValues, type FormFieldDefinition } from '../../types/forms';
import type { Student, CenterSummary } from '../../types';
import { ArrowLeft } from 'lucide-react';

export const FormRendererPage: React.FC = () => {
  const { templateId } = useParams();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [fields, setFields] = useState<FormFieldDefinition[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [centers, setCenters] = useState<CenterSummary[]>([]);
  const [studentId, setStudentId] = useState('');
  const [centerId, setCenterId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DynamicFormValues>();

  useEffect(() => {
    if (!templateId) {
      setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [t, sRes, c] = await Promise.all([
          getFormTemplate(templateId),
          getStudents({ limit: 200 }),
          listCenters(),
        ]);
        if (!alive) return;
        const tpl = t as { name: string; schema: unknown; isActive?: boolean };
        if (tpl.isActive === false) {
          setError('This template is inactive.');
          setFields([]);
          return;
        }
        setTitle(tpl.name);
        const ui = apiSchemaToUiFields(tpl.schema);
        setFields(ui);
        const defs: DynamicFormValues = {};
        for (const f of ui) {
          if (f.type === 'checkbox') defs[f.id] = false;
          else defs[f.id] = '';
        }
        reset(defs);
        setStudents(sRes.students);
        setCenters(c);
        if (sRes.students[0]) setStudentId(sRes.students[0].id);
        if (c[0]) setCenterId(c[0].id);
      } catch {
        if (alive) setError('Could not load this form.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [templateId, reset]);

  const onSubmit = async (data: DynamicFormValues) => {
    if (!templateId || !studentId || !centerId) {
      setError('Select a student and center.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await submitForm({
        templateId,
        studentId,
        centerId,
        data: data as Record<string, unknown>,
      });
      setDone(true);
    } catch {
      setError('Submission failed. Check required answers and permissions.');
    } finally {
      setSaving(false);
    }
  };

  if (!templateId) {
    return <Navigate to="/forms" replace />;
  }

  if (loading) {
    return (
      <PageWrapper title="Fill form">
        <LoadingSpinner />
      </PageWrapper>
    );
  }

  if (done) {
    return (
      <PageWrapper title="Submitted">
        <Card>
          <p className="text-neutral-800 font-medium">Response saved.</p>
          <Button className="mt-4" variant="secondary" onClick={() => navigate('/forms')}>
            Back to forms
          </Button>
        </Card>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      title={title || 'Fill form'}
      actions={
        <Button variant="ghost" onClick={() => navigate('/forms')} className="bg-white">
          <ArrowLeft size={18} className="mr-2" /> Back
        </Button>
      }
    >
      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} />
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
        <Card>
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-4">Context</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-600">Student</label>
              <select
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                required
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-600">Center</label>
              <select
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={centerId}
                onChange={(e) => setCenterId(e.target.value)}
                required
              >
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        <Card>
          <div className="space-y-4">
            {fields.map((field) => (
              <FieldRenderer key={field.id} field={field} register={register} errors={errors} />
            ))}
          </div>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" isLoading={saving} disabled={!fields.length}>
            Submit
          </Button>
        </div>
      </form>
    </PageWrapper>
  );
};
