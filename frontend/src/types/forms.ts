/** UI field types for the builder & renderer (API uses a slightly different set). */

export type FormFieldTypeUI = 'text' | 'number' | 'textarea' | 'dropdown' | 'date' | 'checkbox';

export interface FormFieldDefinition {
  id: string;
  type: FormFieldTypeUI;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

/** Backend `formService` field shape (stored in JSON). */
export type ApiFormFieldType = 'text' | 'textarea' | 'date' | 'number' | 'boolean' | 'select';

export interface ApiFormField {
  name: string;
  label: string;
  type: ApiFormFieldType;
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface ApiFormSchema {
  fields: ApiFormField[];
  version?: number;
}

export function newFieldId(): string {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function uiFieldsToApiSchema(fields: FormFieldDefinition[]): ApiFormSchema {
  return {
    version: 1,
    fields: fields.map((f) => {
      const type: ApiFormFieldType =
        f.type === 'dropdown'
          ? 'select'
          : f.type === 'checkbox'
            ? 'boolean'
            : f.type === 'textarea'
              ? 'textarea'
              : f.type === 'date'
                ? 'date'
                : f.type === 'number'
                  ? 'number'
                  : 'text';
      return {
        name: f.id,
        label: f.label,
        type,
        required: f.required,
        ...(f.placeholder ? { placeholder: f.placeholder } : {}),
        ...(type === 'select' && f.options?.length ? { options: f.options } : {}),
      };
    }),
  };
}

export function apiSchemaToUiFields(schema: unknown): FormFieldDefinition[] {
  if (!schema || typeof schema !== 'object' || !('fields' in schema)) return [];
  const raw = (schema as { fields: ApiFormField[] }).fields;
  if (!Array.isArray(raw)) return [];
  return raw.map((f) => ({
    id: f.name,
    label: f.label,
    required: Boolean(f.required),
    placeholder: f.placeholder,
    options: f.options,
    type:
      f.type === 'select'
        ? 'dropdown'
        : f.type === 'boolean'
          ? 'checkbox'
          : f.type === 'textarea'
            ? 'textarea'
            : f.type === 'date'
              ? 'date'
              : f.type === 'number'
                ? 'number'
                : 'text',
  }));
}

export type DynamicFormValues = Record<string, string | number | boolean | undefined>;
