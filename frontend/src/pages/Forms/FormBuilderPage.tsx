import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { FieldEditor } from '../../components/forms/FieldEditor';
import { FormPreview } from '../../components/forms/FormPreview';
import { useAuthStore } from '../../store/useAuthStore';
import {
  createFormTemplate,
  getFormTemplate,
  updateFormTemplate,
} from '../../services/forms.service';
import {
  type FormFieldDefinition,
  newFieldId,
  uiFieldsToApiSchema,
  apiSchemaToUiFields,
} from '../../types/forms';
import { ArrowLeft, Plus } from 'lucide-react';

const defaultField = (): FormFieldDefinition => ({
  id: newFieldId(),
  type: 'text',
  label: 'New field',
  required: false,
  placeholder: '',
});

export const FormBuilderPage: React.FC = () => {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const isAdmin = useAuthStore((s) => ['super_admin', 'center_admin', 'tech_admin'].includes(s.currentUser?.role || ''));
  const isEdit = Boolean(templateId);

  const [name, setName] = useState('');
  const [formType, setFormType] = useState('general');
  const [fields, setFields] = useState<FormFieldDefinition[]>([defaultField()]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const t = (await getFormTemplate(templateId)) as {
          name: string;
          formType: string;
          schema: unknown;
        };
        if (!alive) return;
        setName(t.name);
        setFormType(t.formType);
        const ui = apiSchemaToUiFields(t.schema);
        setFields(ui.length ? ui : [defaultField()]);
      } catch {
        if (alive) setError('Template not found.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [templateId]);

  if (!isAdmin) {
    return <Navigate to="/forms" replace />;
  }

  const validate = (): string | null => {
    if (!name.trim()) return 'Template name is required.';
    if (!formType.trim()) return 'Form type is required.';
    for (const f of fields) {
      if (!f.id.trim()) return 'Each field needs an id (API key).';
      if (!f.label.trim()) return 'Each field needs a label.';
      if (f.type === 'dropdown' && (!f.options || f.options.length === 0)) {
        return `Dropdown "${f.label}" needs at least one option.`;
      }
    }
    return null;
  };

  const handleSave = async () => {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        formType: formType.trim(),
        name: name.trim(),
        schema: uiFieldsToApiSchema(fields),
      };
      if (isEdit && templateId) {
        await updateFormTemplate(templateId, body);
        navigate(`/forms/${templateId}/submissions`);
      } else {
        const created = (await createFormTemplate(body)) as { id: string };
        navigate(`/forms/${created.id}/edit`, { replace: true });
      }
    } catch {
      setError('Save failed. Check field configuration and try again.');
    } finally {
      setSaving(false);
    }
  };

  const move = (index: number, delta: number) => {
    const next = index + delta;
    if (next < 0 || next >= fields.length) return;
    setFields((prev) => {
      const copy = [...prev];
      const [row] = copy.splice(index, 1);
      copy.splice(next, 0, row);
      return copy;
    });
  };

  if (loading) {
    return (
      <PageWrapper title={isEdit ? 'Edit form' : 'New form'}>
        <LoadingSpinner />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      title={isEdit ? 'Edit form template' : 'Create form template'}
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="space-y-4">
          <Card>
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">Template</h2>
            <div className="space-y-4">
              <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} required />
              <Input
                label="Form type (slug / category)"
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                helperText="Used for filtering and reporting (e.g. meeting_log, intake)."
                required
              />
            </div>
          </Card>

          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-neutral-900">Fields</h2>
            <Button type="button" variant="secondary" size="sm" onClick={() => setFields((f) => [...f, defaultField()])}>
              <Plus size={16} className="mr-1" /> Add field
            </Button>
          </div>

          <div className="space-y-4">
            {fields.map((field, index) => (
              <FieldEditor
                key={`${field.id}-${index}`}
                field={field}
                index={index}
                total={fields.length}
                onChange={(i, next) => setFields((prev) => prev.map((p, j) => (j === i ? next : p)))}
                onDelete={(i) => setFields((prev) => prev.filter((_, j) => j !== i))}
                onMoveUp={(i) => move(i, -1)}
                onMoveDown={(i) => move(i, 1)}
              />
            ))}
          </div>

          <div className="flex justify-end gap-2 pb-8">
            <Button variant="secondary" type="button" onClick={() => navigate('/forms')} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" type="button" isLoading={saving} onClick={() => void handleSave()}>
              {isEdit ? 'Save changes' : 'Create template'}
            </Button>
          </div>
        </div>

        <div className="xl:sticky xl:top-4 space-y-4">
          <FormPreview fields={fields} title="Live preview" />
          <p className="text-xs text-neutral-500 px-1">
            Preview uses the same field renderer as the fill-out page. Saving sends the schema to{' '}
            <code className="text-neutral-700">POST /api/forms/templates</code> (or PUT when editing).
          </p>
        </div>
      </div>
    </PageWrapper>
  );
};
