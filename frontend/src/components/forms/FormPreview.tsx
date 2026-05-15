import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Card } from '../ui/Card';
import { FieldRenderer } from './FieldRenderer';
import type { DynamicFormValues, FormFieldDefinition } from '../../types/forms';

type Props = {
  fields: FormFieldDefinition[];
  title?: string;
};

function buildDefaults(fields: FormFieldDefinition[]): DynamicFormValues {
  const d: DynamicFormValues = {};
  for (const f of fields) {
    if (f.type === 'checkbox') d[f.id] = false;
    else if (f.type === 'number') d[f.id] = undefined;
    else d[f.id] = '';
  }
  return d;
}

export const FormPreview: React.FC<Props> = ({ fields, title = 'Preview' }) => {
  const { register, reset, formState: { errors } } = useForm<DynamicFormValues>({
    defaultValues: buildDefaults(fields),
  });

  useEffect(() => {
    reset(buildDefaults(fields));
  }, [fields, reset]);

  return (
    <Card className="h-full min-h-[200px]">
      <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-4">{title}</h3>
      {fields.length === 0 ? (
        <p className="text-sm text-neutral-400">Add fields to see a live preview.</p>
      ) : (
        <div className="space-y-4">
          {fields.map((field) => (
            <FieldRenderer key={field.id} field={field} register={register} errors={errors} />
          ))}
        </div>
      )}
    </Card>
  );
};
