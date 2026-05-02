import { FormEvent, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const auth = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await auth.login({ username, password });
    } catch {
      setError('Неверный логин или пароль');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <Icon name="logo" className="h-10 w-10" />
          <div>
            <h1 className="text-3xl font-bold text-fg">EpiCase</h1>
            <p className="text-sm text-fg-muted">Учебные клинические кейсы</p>
          </div>
        </div>
        <Card title="Вход в систему" description="Используйте учетную запись ВМедА">
          <form className="space-y-4" onSubmit={onSubmit}>
            {error ? (
              <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                {error}
              </div>
            ) : null}
            <Input label="Логин" name="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
            <Input
              label="Пароль"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Button className="w-full" type="submit" isLoading={isSubmitting}>
              Войти
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
