import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { NodeOut } from '@/types/scenario';
import type { PlayerFeedback } from '@/stores/casePlayerStore';

export interface TextInputViewProps {
  node: NodeOut;
  feedback?: PlayerFeedback | null;
  onSubmit: (value: string) => void;
  onNext: () => void;
  isSubmitting?: boolean;
}

export function TextInputView({ node, feedback, onSubmit, onNext, isSubmitting }: TextInputViewProps) {
  const minLength = Number(node.data.min_length ?? 1);
  const [value, setValue] = useState('');
  const submitted = feedback != null;
  const canSubmit = value.trim().length >= minLength;

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-fg">{node.title}</h2>
      <div className="space-y-1.5">
        <label htmlFor={`text-${node.id}`} className="block text-sm font-medium text-fg">
          Ответ
        </label>
        <textarea
          id={`text-${node.id}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={submitted || isSubmitting}
          className="min-h-32 w-full rounded border border-border bg-bg px-3 py-2 text-sm text-fg focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/40"
        />
        <p className="text-xs text-fg-muted">
          Минимум {minLength} символов · введено {value.trim().length}
        </p>
      </div>

      {submitted && feedback ? (
        <div
          data-testid="text-feedback"
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
        <Button onClick={onNext}>Далее</Button>
      ) : (
        <Button onClick={() => onSubmit(value.trim())} disabled={!canSubmit || isSubmitting} isLoading={isSubmitting}>
          Ответить
        </Button>
      )}
    </section>
  );
}

export default TextInputView;
