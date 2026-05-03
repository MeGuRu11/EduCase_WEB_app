import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/Badge';
import { STEP_RESULT_CHECK_KEY, type StepResult } from '@/types/attempt';
import { cn } from '@/utils/cn';

export interface FeedbackBannerProps {
  result: StepResult;
}

function feedbackTone(result: StepResult) {
  const check = result[STEP_RESULT_CHECK_KEY];
  if (check === true) return 'success';
  if (check === false) return 'danger';
  return 'warning';
}

export function FeedbackBanner({ result }: FeedbackBannerProps) {
  const tone = feedbackTone(result);

  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4',
        tone === 'success' && 'border-success/30 bg-success/10 text-success',
        tone === 'danger' && 'border-danger/30 bg-danger/10 text-danger',
        tone === 'warning' && 'border-warning/30 bg-warning/10 text-warning',
      )}
    >
      <div>
        <p className="text-sm font-semibold">
          {tone === 'success' ? 'Верно' : tone === 'danger' ? 'Нужно исправить ход решения' : 'Ответ принят'}
        </p>
        {result.feedback ? <p className="mt-1 text-sm text-fg">{result.feedback}</p> : null}
      </div>
      <Badge variant={tone}>
        <motion.span
          animate={{ opacity: 1, y: 0 }}
          className="tabular-nums"
          initial={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
        >
          +{result.score} / {result.max_score}
        </motion.span>
      </Badge>
    </div>
  );
}

export default FeedbackBanner;
