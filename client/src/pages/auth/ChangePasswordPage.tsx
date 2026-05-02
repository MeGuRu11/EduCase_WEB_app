import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usersApi } from '@/api/users';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { getHomeByRole } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const markPasswordChanged = useAuthStore((state) => state.markPasswordChanged);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await usersApi.changePassword({ old_password: oldPassword, new_password: newPassword });
      markPasswordChanged();
      navigate(getHomeByRole(user?.role), { replace: true });
    } catch {
      setError('Не удалось сменить пароль');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6">
      <Card title="Смена пароля" description="Задайте новый пароль перед продолжением" className="w-full max-w-md">
        <form className="space-y-4" onSubmit={onSubmit}>
          {error ? (
            <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              {error}
            </div>
          ) : null}
          <Input
            label="Текущий пароль"
            name="old_password"
            type="password"
            value={oldPassword}
            onChange={(event) => setOldPassword(event.target.value)}
            required
          />
          <Input
            label="Новый пароль"
            name="new_password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
          <Button className="w-full" type="submit" isLoading={isSubmitting}>
            Сменить пароль
          </Button>
        </form>
      </Card>
    </main>
  );
}
