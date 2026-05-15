import React from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import type { FormFieldDefinition, FormFieldTypeUI } from '../../types/forms';

type Props = {
  field: FormFieldDefinition;
  index: number;
  total: number;
  onChange: (index: number, next: FormFieldDefinition) => void;
  onDelete: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
};

const FIELD_TYPES: { value: FormFieldTypeUI; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Checkbox' },
];

export const FieldEditor: React.FC<Props> = ({
  field,
  index,
  total,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}) => {
  const patch = (partial: Partial<FormFieldDefinition>) => {
    onChange(index, { ...field, ...partial });
  };

  const optionsText = (field.options ?? []).join('\n');

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Field {index + 1}</span>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="px-2"
            disabled={index === 0}
            onClick={() => onMoveUp(index)}
            aria-label="Move up"
          >
            <ChevronUp size={18} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="px-2"
            disabled={index >= total - 1}
            onClick={() => onMoveDown(index)}
            aria-label="Move down"
          >
            <ChevronDown size={18} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="px-2 text-danger"
            onClick={() => onDelete(index)}
            aria-label="Delete field"
          >
            <Trash2 size={18} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-neutral-600">Type</label>
          <select
            value={field.type}
            onChange={(e) => {
              const type = e.target.value as FormFieldTypeUI;
              patch({
                type,
                options: type === 'dropdown' ? field.options?.length ? field.options : ['Option A'] : undefined,
              });
            }}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <Input label="Field id (API key)" value={field.id} onChange={(e) => patch({ id: e.target.value })} />
      </div>

      <Input label="Label" value={field.label} onChange={(e) => patch({ label: e.target.value })} required />

      <div className="flex items-center gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-neutral-800 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-neutral-300"
            checked={field.required}
            onChange={(e) => patch({ required: e.target.checked })}
          />
          Required
        </label>
      </div>

      {(field.type === 'text' || field.type === 'textarea' || field.type === 'number') && (
        <Input
          label="Placeholder"
          value={field.placeholder ?? ''}
          onChange={(e) => patch({ placeholder: e.target.value || undefined })}
        />
      )}

      {field.type === 'dropdown' && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-neutral-600">Options (one per line)</label>
          <textarea
            value={optionsText}
            onChange={(e) =>
              patch({
                options: e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            rows={4}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      )}
    </div>
  );
};
