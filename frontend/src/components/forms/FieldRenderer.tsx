import React from 'react';
import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { Input } from '../ui/Input';
import { cn } from '../ui/Button';
import type { DynamicFormValues, FormFieldDefinition } from '../../types/forms';

type Props = {
  field: FormFieldDefinition;
  register: UseFormRegister<DynamicFormValues>;
  errors: FieldErrors<DynamicFormValues>;
};

export const FieldRenderer: React.FC<Props> = ({ field, register, errors }) => {
  const err = errors[field.id]?.message as string | undefined;

  switch (field.type) {
    case 'text':
      return (
        <Input
          label={field.label}
          type="text"
          placeholder={field.placeholder}
          {...register(field.id, {
            required: field.required ? `${field.label} is required` : false,
          })}
          error={err}
        />
      );
    case 'number':
      return (
        <Input
          label={field.label}
          type="number"
          placeholder={field.placeholder}
          {...register(field.id, {
            required: field.required ? `${field.label} is required` : false,
            setValueAs: (v) => (v === '' || v === undefined || v === null ? undefined : Number(v)),
            validate: (v) =>
              field.required && (v === undefined || Number.isNaN(Number(v)))
                ? 'Enter a valid number'
                : true,
          })}
          error={err}
        />
      );
    case 'textarea':
      return (
        <div className="w-full flex flex-col gap-1.5">
          <label className="text-xs uppercase tracking-wide text-neutral-600 font-medium">
            {field.label}
            {field.required && <span className="text-danger ml-1">*</span>}
          </label>
          <textarea
            {...register(field.id, {
              required: field.required ? `${field.label} is required` : false,
            })}
            placeholder={field.placeholder}
            rows={4}
            className={cn(
              'w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900',
              'placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
              err && 'border-danger',
            )}
          />
          {err && <p className="text-sm text-danger">{err}</p>}
        </div>
      );
    case 'dropdown':
      return (
        <div className="w-full flex flex-col gap-1.5">
          <label className="text-xs uppercase tracking-wide text-neutral-600 font-medium">
            {field.label}
            {field.required && <span className="text-danger ml-1">*</span>}
          </label>
          <select
            {...register(field.id, {
              required: field.required ? `${field.label} is required` : false,
            })}
            className={cn(
              'flex h-12 md:h-11 w-full rounded-lg border border-neutral-300 bg-white px-4 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-primary',
              err && 'border-danger',
            )}
          >
            <option value="">Select…</option>
            {(field.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {err && <p className="text-sm text-danger">{err}</p>}
        </div>
      );
    case 'date':
      return (
        <Input
          label={field.label}
          type="date"
          {...register(field.id, {
            required: field.required ? `${field.label} is required` : false,
          })}
          error={err}
        />
      );
    case 'checkbox':
      return (
        <div className="flex flex-col gap-1">
          <label className="inline-flex items-center gap-3 cursor-pointer touch-manipulation">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary"
              {...register(field.id, {
                setValueAs: (v) => v === true || v === 'on',
              })}
            />
            <span className="text-sm font-medium text-neutral-900">
              {field.label}
              {field.required && <span className="text-danger ml-1">*</span>}
            </span>
          </label>
          {err && <p className="text-sm text-danger">{err}</p>}
        </div>
      );
    default:
      return null;
  }
};
