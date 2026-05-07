import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import type { NodeOut } from '@/types/scenario';
import type { PlayerFeedback } from '@/stores/casePlayerStore';

interface Option {
  id: string;
  label: string;
}

export interface DecisionViewProps {
  node: NodeOut;
  feedback?: PlayerFeedback | null;
  onSubmit: (selected: string[]) => void;
  onNext: () => void;
  isSubmitting?: boolean;
}

function readOptions(data: NodeOut['data']): Option[] {
  if (!Array.isArray(data.options)) return [];
  return data.options
    .filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === 'object')
    .map((o, idx) => ({
      id: String(o.id ?? idx),
      label: String(o.label ?? o.id ?? ''),
    }));
}

export function DecisionView({ node, feedback, onSubmit, onNext, isSubmitting }: DecisionViewProps) {
  const allowMultiple = Boolean(node.data.allow_multiple);
  const options = readOptions(node.data);
  const [selected, setSelected] = useState<string[]>([]);
  const submitted = feedback != null;

  const toggle = (id: string) => {
    if (allowMultiple) {
      setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    } else {
      setSelected([id]);
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-fg">{node.title}</h2>
      <ul className="space-y-2">
        {options.map((opt) => (
          <li key={opt.id}>
            <label className="flex items-center gap-3 rounded-lg border border-border bg-bg p-3 text-sm">
              <input
                type={allowMultiple ? 'checkbox' : 'radio'}
                name={`decision-${node.id}`}
                value={opt.id}
                checked={selected.includes(opt.id)}
                onChange={() => toggle(opt.id)}
                disabled={submitted || isSubmitting}
                aria-label={opt.label}
              />
              <span>{opt.label}</span>
            </label>
          </li>
        ))}
      </ul>

      {submitted && feedback ? (
        <div
          data-testid="decision-feedback"
          data-correct={String(feedback.correct)}
          className={cn(
            'rounded-xl border p-4 text-sm',
            feedback.correct
              ? 'border-success bg-success/10 text-success'
              : 'border-danger bg-danger/10 text-danger',
          )}
        >
          <p className="font-semibold">{feedback.feedback || (feedback.correct ? 'Верно' : 'Неверно')}</p>
          <p>
            Баллы: {feedback.score}/{feedback.max_score}
          </p>
        </div>
      ) : null}

      {submitted ? (
        <Button onClick={onNext}>Далее</Button>
      ) : (
        <Button
          onClick={() => onSubmit(selected)}
          disabled={selected.length === 0 || isSubmitting}
          isLoading={isSubmitting}
        >
          Ответить
        </Button>
      )}
    </section>
  );
}

export default DecisionView;
