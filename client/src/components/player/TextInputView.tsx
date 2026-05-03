import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import FeedbackBanner from './FeedbackBanner';
import type { StepOut } from '@/types/attempt';
import type { JsonObject, NodeOut } from '@/types/scenario';

export interface TextInputViewProps {
  node: NodeOut;
  onAdvance: (nextNode: NodeOut | null, result: StepOut) => void;
  onSubmit: (answerData: JsonObject) => Promise<StepOut>;
}

function matchedKeywords(details: JsonObject) {
  const raw = details.matched_keywords;
  return Array.isArray(raw) ? raw.map(String) : [];
}

export default function TextInputView({ node, onAdvance, onSubmit }: TextInputViewProps) {
  const minLength = Number(node.data.min_length ?? 0);
  const [text, setText] = useState('');
  const [step, setStep] = useState<StepOut | null>(null);
  const [canAdvance, setCanAdvance] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit = text.trim().length >= minLength;
  const matches = step ? matchedKeywords(step.step_result.details) : [];

  useEffect(() => {
    setText('');
    setStep(null);
    setCanAdvance(false);
  }, [node.id]);

  useEffect(() => {
    if (!step) return undefined;
    const timer = window.setTimeout(() => setCanAdvance(true), 1_000);
    return () => window.clearTimeout(timer);
  }, [step]);

  const submit = async () => {
    setIsSubmitting(true);
    try {
      const result = await onSubmit({ text });
      setStep(result);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <article className="space-y-5">
      <div>
        <p className="text-sm font-medium text-purple">Свободный ответ</p>
        <h2 className="text-2xl font-semibold text-fg">{node.title}</h2>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-fg" htmlFor={`text-${node.id}`}>
          Ответ
        </label>
        <textarea
          className="focus-ring min-h-40 w-full rounded border border-border bg-bg px-3 py-2 text-sm text-fg"
          id={`text-${node.id}`}
          onChange={(event) => setText(event.target.value)}
          value={text}
        />
        <p className="text-xs text-fg-muted">
          {text.trim().length} / {minLength}
        </p>
      </div>

      {step ? <FeedbackBanner result={step.step_result} /> : null}

      {matches.length ? (
        <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
          Совпавшие ключевые слова: {matches.join(', ')}
        </div>
      ) : null}

      <div className="flex justify-end gap-3">
        {!step ? (
          <Button disabled={!canSubmit} isLoading={isSubmitting} onClick={submit}>
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
