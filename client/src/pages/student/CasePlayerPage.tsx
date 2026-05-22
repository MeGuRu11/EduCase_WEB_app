import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CasePlayer } from '@/components/player/CasePlayer';
import { EmptyState } from '@/components/ui/EmptyState';
import { useCasePlayerStore } from '@/stores/casePlayerStore';

export default function CasePlayerPage() {
  const id = Number(useParams().id);
  const reset = useCasePlayerStore((s) => s.reset);

  useEffect(() => {
    return () => reset();
  }, [reset]);

  if (!Number.isFinite(id)) {
    return <EmptyState icon="warn" title="Некорректный идентификатор кейса" />;
  }

  return (
    <div data-testid="case-player-page" className="h-[calc(100vh-5rem)]">
      <CasePlayer scenarioId={id} />
    </div>
  );
}
