import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { NodeOut } from '@/types/scenario';
import type { PlayerFeedback } from '@/stores/casePlayerStore';

interface FieldDef {
  id: string;
  label: string;
  type?: string;
  required?: boolean;
  validation_regex?: string;
}

function readFields(data: NodeOut['data']): FieldDef[] {
  if (!Array.isArray(data.fields)) return [];
  return data.fields
    .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === 'object')
    .map((f) => ({
      id: String(f.id ?? ''),
      label: String(f.label ?? f.id ?? ''),
      type: typeof f.type === 'string' ? f.type : 'text',
      required: Boolean(f.required),
      validation_regex: typeof f.validation_regex === 'string' ? f.validation_regex : undefined,
    }))
    .filter((f) => f.id);
}

function buildSchema(fields: FieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    let s: z.ZodTypeAny = z.string();
    if (f.required) s = (s as z.ZodString).min(1, 'Поле обязательно');
    if (f.validation_regex) {
      try {
        const re = new RegExp(f.validation_regex);
        s = (s as z.ZodString).regex(re, 'Не соответствует формату');
      } catch {
        // ignore malformed pattern; backend remains the authoritative validator.
      }
    }
    shape[f.id] = s;
  }
  return z.object(shape);
}

export interface FormViewProps {
  node: NodeOut;
  feedback?: PlayerFeedback | null;
  onSubmit: (values: Record<string, string>) => void;
  onNext: () => void;
  isSubmitting?: boolean;
}

export function FormView({ node, feedback, onSubmit, onNext, isSubmitting }: FormViewProps) {
  const fields = readFields(node.data);
  const schema = buildSchema(fields);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Record<string, string>>({
    defaultValues: Object.fromEntries(fields.map((f) => [f.id, ''])),
  });

  const submitted = feedback != null;

  const submit = handleSubmit((raw) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return;
    onSubmit(parsed.data as Record<string, string>);
  });

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-fg">{node.title}</h2>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          void submit(e);
        }}
        noValidate
      >
        {fields.map((f) => {
          const fieldError = errors[f.id]?.message;
          return (
            <div key={f.id} className="space-y-1">
              <Input
                label={f.label}
                type={f.type === 'number' ? 'number' : 'text'}
                {...register(f.id, {
                  validate: (value) => {
                    if (f.required && !String(value ?? '').trim()) return 'Поле обязательно';
                    return true;
                  },
                })}
                aria-invalid={Boolean(fieldError)}
              />
              {fieldError ? (
                <p className="text-xs text-danger-ink" role="alert">
                  {String(fieldError)}
                </p>
              ) : null}
            </div>
          );
        })}

        {submitted && feedback ? (
          <div
            data-testid="form-feedback"
            data-correct={String(feedback.correct)}
            className={
              feedback.correct
                ? 'rounded-xl border border-success bg-success/10 p-3 text-sm text-success-ink'
                : 'rounded-xl border border-danger bg-danger/10 p-3 text-sm text-danger-ink'
            }
          >
            <p>{feedback.feedback || (feedback.correct ? 'Верно' : 'Неверно')}</p>
            <p>
              Баллы: {feedback.score}/{feedback.max_score}
            </p>
          </div>
        ) : null}

        {submitted ? (
          <Button type="button" onClick={onNext}>
            Далее
          </Button>
        ) : (
          <Button type="submit" isLoading={isSubmitting}>
            Ответить
          </Button>
        )}
      </form>
    </section>
  );
}

export default FormView;
