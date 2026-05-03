import { useParams } from 'react-router-dom';
import CasePlayer from '@/components/player/CasePlayer';
import { EmptyState } from '@/components/ui/EmptyState';

export default function CasePlayerPage() {
  const scenarioId = Number(useParams().id);

  if (!Number.isFinite(scenarioId)) {
    return <EmptyState icon="warn" title="Некорректный кейс" description="В URL отсутствует идентификатор сценария." />;
  }

  return <CasePlayer scenarioId={scenarioId} />;
}
