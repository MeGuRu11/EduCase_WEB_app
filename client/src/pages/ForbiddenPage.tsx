import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6">
      <div className="max-w-md text-center">
        <Icon name="lock" className="mx-auto mb-6 h-20 w-20 text-danger-ink" />
        <h1 className="mb-3 text-3xl font-bold text-fg">Доступ запрещён</h1>
        <p className="mb-8 text-fg-muted">
          У вас недостаточно прав для просмотра этой страницы. Если вы считаете, что это ошибка,
          обратитесь к администратору.
        </p>
        <Button onClick={() => window.history.back()}>Назад</Button>
      </div>
    </main>
  );
}
