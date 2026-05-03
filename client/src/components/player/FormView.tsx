import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import FeedbackBanner from './FeedbackBanner';
import type { StepOut } from '@/types/attempt';
import type { JsonObject, NodeOut } from '@/types/scenario';

type FieldType = 'text' | 'textarea' | 'select' | 'date' | 'number' | 'checkbox' | 'radio';

interface FormField {
  id?: string;
  key?: string;
  label?: string;
  options?: Array<string | { label?: string; value?: string }>;
  regex?: string;
  required?: boolean;
  type?: FieldType;
  validation_regex?: string;
}

export interface FormViewProps {
  node: NodeOut;
  onAdvance: (nextNode: NodeOut | null, result: StepOut) => void;
  onSubmit: (answerData: JsonObject) => Promise<StepOut>;
}

type FormValues = Record<string, string | number | boolean>;

function fieldsFrom(data: JsonObject): FormField[] {
  return Array.isArray(data.fields) ? (data.fields as FormField[]) : [];
}

function fieldName(field: FormField, index: number) {
  return field.key ?? field.id ?? `field_${index}`;
}

function fieldSchema(field: FormField) {
  const type = field.type ?? 'text';
  if (type === 'checkbox') return z.boolean();
  if (type === 'number') {
    const schema = z.coerce.number({ invalid_type_error: 'Введите число' });
    return field.required ? schema.refine((value) => Number.isFinite(value), 'Required') : schema;
  }

  let schema = z.string();
  if (field.required) schema = schema.min(1, 'Required');
  const pattern = field.validation_regex ?? field.regex;
  if (pattern) schema = schema.regex(new RegExp(pattern), 'Invalid format');
  return schema;
}

function defaultValue(field: FormField) {
  if (field.type === 'checkbox') return false;
  if (field.type === 'number') return '';
  return '';
}

export default function FormView({ node, onAdvance, onSubmit }: FormViewProps) {
  const fields = useMemo(() => fieldsFrom(node.data), [node.data]);
  const [step, setStep] = useState<StepOut | null>(null);
  const [canAdvance, setCanAdvance] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const schema = useMemo(
    () =>
      z.object(
        Object.fromEntries(fields.map((field, index) => [fieldName(field, index), fieldSchema(field)])),
      ),
    [fields],
  );
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<FormValues>({
    defaultValues: Object.fromEntries(fields.map((field, index) => [fieldName(field, index), defaultValue(field)])),
  });

  useEffect(() => {
    reset(Object.fromEntries(fields.map((field, index) => [fieldName(field, index), defaultValue(field)])));
    setStep(null);
    setCanAdvance(false);
  }, [fields, reset]);

  useEffect(() => {
    if (!step) return undefined;
    const timer = window.setTimeout(() => setCanAdvance(true), 1_000);
    return () => window.clearTimeout(timer);
  }, [step]);

  const submit = handleSubmit(async (values) => {
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const name = String(issue.path[0]);
        setError(name, { message: issue.message, type: 'validate' });
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onSubmit({ fields: parsed.data });
      setStep(result);
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <article className="space-y-5">
      <div>
        <p className="text-sm font-medium text-royal">Форма</p>
        <h2 className="text-2xl font-semibold text-fg">{node.title}</h2>
      </div>

      <form className="space-y-4" onSubmit={submit}>
        {fields.map((field, index) => {
          const name = fieldName(field, index);
          const label = field.label ?? name;
          const type = field.type ?? 'text';
          const error = errors[name]?.message;

          if (type === 'textarea') {
            return (
              <div className="space-y-1.5" key={name}>
                <label className="block text-sm font-medium text-fg" htmlFor={name}>
                  {label}
                </label>
                <textarea
                  className="focus-ring min-h-28 w-full rounded border border-border bg-bg px-3 py-2 text-sm text-fg"
                  id={name}
                  {...register(name)}
                />
                {error ? <p className="text-xs text-danger">{String(error)}</p> : null}
              </div>
            );
          }

          if (type === 'select' || type === 'radio') {
            const options = field.options ?? [];
            return (
              <div className="space-y-1.5" key={name}>
                <label className="block text-sm font-medium text-fg" htmlFor={name}>
                  {label}
                </label>
                <select
                  className="focus-ring h-10 w-full rounded border border-border bg-bg px-3 text-sm text-fg"
                  id={name}
                  {...register(name)}
                >
                  <option value="">Выберите</option>
                  {options.map((option) => {
                    const value = typeof option === 'string' ? option : option.value ?? option.label ?? '';
                    const text = typeof option === 'string' ? option : option.label ?? option.value ?? '';
                    return (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    );
                  })}
                </select>
                {error ? <p className="text-xs text-danger">{String(error)}</p> : null}
              </div>
            );
          }

          if (type === 'checkbox') {
            return (
              <label className="flex items-center gap-3 text-sm text-fg" key={name}>
                <input className="focus-ring h-4 w-4 accent-royal" type="checkbox" {...register(name)} />
                <span>{label}</span>
              </label>
            );
          }

          return (
            <div className="space-y-1.5" key={name}>
              <label className="block text-sm font-medium text-fg" htmlFor={name}>
                {label}
              </label>
              <input
                className="focus-ring h-10 w-full rounded border border-border bg-bg px-3 text-sm text-fg"
                id={name}
                type={type}
                {...register(name)}
              />
              {error ? <p className="text-xs text-danger">{String(error)}</p> : null}
            </div>
          );
        })}

        {step ? <FeedbackBanner result={step.step_result} /> : null}

        <div className="flex justify-end gap-3">
          {!step ? (
            <Button isLoading={isSubmitting} type="submit">
              Отправить форму
            </Button>
          ) : (
            <Button disabled={!canAdvance} onClick={() => onAdvance(step.next_node, step)}>
              Далее
            </Button>
          )}
        </div>
      </form>
    </article>
  );
}
