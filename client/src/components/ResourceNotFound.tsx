import { EmptyState } from './ui/EmptyState';

export interface ResourceNotFoundProps {
  resourceType: string;
  backUrl: string;
  backLabel: string;
}

export function ResourceNotFound({ backLabel, backUrl, resourceType }: ResourceNotFoundProps) {
  return (
    <EmptyState
      icon="search"
      title={`${resourceType} не найден`}
      description="Ресурс удалён или у вас нет к нему доступа. Возможно, администратор обновил данные."
      action={{ label: backLabel, href: backUrl }}
    />
  );
}
