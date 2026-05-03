import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import FeedbackBanner from './FeedbackBanner';
import type { StepOut } from '@/types/attempt';
import type { JsonObject, NodeOut } from '@/types/scenario';

interface DecisionOption {
  id: string;
  text?: string;
  label?: string;
}

export interface DecisionViewProps {
  node: NodeOut;
  onAdvance: (nextNode: NodeOut | null, result: StepOut) => void;
  onSubmit: (answerData: JsonObject) => Promise<StepOut>;
}

function optionsFrom(data: JsonObject): DecisionOption[] {
  return Array.isArray(data.options) ? (data.options as DecisionOption[]) : [];
}

export default function DecisionView({ node, onAdvance, onSubmit }: DecisionViewProps) {
  const allowMultiple = Boolean(node.data.allow_multiple);
  const options = optionsFrom(node.data);
  const [selected, setSelected] = useState<string[]>([]);
  const [step, setStep] = useState<StepOut | null>(null);
  const [canAdvance, setCanAdvance] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setSelected([]);
    setStep(null);
    setCanAdvance(false);
  }, [node.id]);

  useEffect(() => {
    if (!step) return undefined;
    const timer = window.setTimeout(() => setCanAdvance(true), 1_000);
    return () => window.clearTimeout(timer);
  }, [step]);

  const toggle = (optionId: string) => {
    if (!allowMultiple) {
      setSelected([optionId]);
      return;
    }
    setSelected((current) =>
      current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId],
    );
  };

  const submit = async () => {
    setIsSubmitting(true);
    try {
      const answer = allowMultiple ? { selected_option_ids: selected } : { selected_option_id: selected[0] };
      const result = await onSubmit(answer);
      setStep(result);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <article className="space-y-5">
      <div>
        <p className="text-sm font-medium text-purple">Решение</p>
        <h2 className="text-2xl font-semibold text-fg">{node.title}</h2>
      </div>

      <fieldset className="space-y-3">
        <legend className="sr-only">{node.title}</legend>
        {options.map((option) => {
          const label = option.text ?? option.label ?? option.id;
          return (
            <label
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-bg p-3 text-sm text-fg hover:bg-surface"
              key={option.id}
            >
              <input
                checked={selected.includes(option.id)}
                className="focus-ring h-4 w-4 accent-royal"
                name={`decision-${node.id}`}
                onChange={() => toggle(option.id)}
                type={allowMultiple ? 'checkbox' : 'radio'}
              />
              <span>{label}</span>
            </label>
          );
        })}
      </fieldset>

      {step ? <FeedbackBanner result={step.step_result} /> : null}

      <div className="flex justify-end gap-3">
        {!step ? (
          <Button disabled={!selected.length} isLoading={isSubmitting} onClick={submit}>
            Ответить
          </Button>
        ) : (
          <Button disabled={!canAdvance} onClick={() => onAdvance(step.next_node, step)}>
            Далее
          </Button>
        )}
      </div>
    </article>
  );
}
