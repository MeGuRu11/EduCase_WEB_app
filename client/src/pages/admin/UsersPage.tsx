import { useMemo, useState, type ReactNode } from 'react';
import { AxiosError } from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { groupsApi } from '@/api/groups';
import { usersApi } from '@/api/users';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table } from '@/components/ui/Table';
import type { UserBulkError, UserBulkResult, UserCreate, UserOut, UserRole, UserUpdate } from '@/types/user';
import { formatDateTime } from '@/utils/formatters';

const roleLabels: Record<UserRole, string> = {
  student: 'Студент',
  teacher: 'Преподаватель',
  admin: 'Администратор',
};

const roleIds: Record<UserRole, number> = { student: 1, teacher: 2, admin: 3 };
const templateCsv = 'username;password;full_name;role;group_name;email\nivanov.i;Student123!;Иванов И.И.;student;431 учебная;\n';

interface CsvPreviewRow {
  row: number;
  username: string;
  full_name: string;
  role: string;
  group_name: string;
}

interface CreateForm {
  username: string;
  password: string;
  full_name: string;
  role: UserRole;
  group_id: string;
}

function SelectField({ children, label, onChange, value }: { children: ReactNode; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-fg">
      <span>{label}</span>
      <select
        className="h-10 w-full rounded border border-border bg-bg px-3 text-sm text-fg focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/40"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function readFileText(file: File): Promise<string> {
  if ('text' in file && typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Cannot read CSV file'));
    reader.readAsText(file);
  });
}

function parseCsvPreview(text: string): CsvPreviewRow[] {
  return text
    .split(/\r?\n/)
    .slice(1, 11)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      const [username = '', , full_name = '', role = '', group_name = ''] = line.split(';');
      return { row: index + 2, username, full_name, role, group_name };
    });
}

function extractBulkErrors(error: unknown): UserBulkError[] {
  if (!(error instanceof AxiosError)) return [{ row: 0, detail: 'Не удалось импортировать CSV' }];
  const detail = error.response?.data?.detail as Partial<UserBulkResult> | string | undefined;
  if (detail && typeof detail === 'object' && Array.isArray(detail.errors)) return detail.errors;
  return [{ row: 0, detail: typeof detail === 'string' ? detail : 'Не удалось импортировать CSV' }];
}

function userMatches(user: UserOut, search: string, role: string, status: string, groupId: string) {
  const needle = search.trim().toLowerCase();
  const matchesSearch = !needle || user.username.toLowerCase().includes(needle) || user.full_name.toLowerCase().includes(needle);
  const matchesRole = role === 'all' || user.role === role;
  const matchesStatus = status === 'all' || (status === 'active' ? user.is_active : !user.is_active);
  const matchesGroup = groupId === 'all' || String(user.group_id ?? '') === groupId;
  return matchesSearch && matchesRole && matchesStatus && matchesGroup;
}

const emptyCreateForm: CreateForm = {
  username: '',
  password: '',
  full_name: '',
  role: 'student',
  group_id: 'none',
};

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [groupId, setGroupId] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm);
  const [editTarget, setEditTarget] = useState<UserOut | null>(null);
  const [editForm, setEditForm] = useState<UserUpdate>({});
  const [csvOpen, setCsvOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserOut | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<UserOut | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvPreviewRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<UserBulkError[]>([]);

  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: () => usersApi.list({ per_page: 100 }) });
  const groups = useQuery({ queryKey: ['groups'], queryFn: () => groupsApi.list() });

  const invalidateUsers = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  const createUser = useMutation({ mutationFn: (payload: UserCreate) => usersApi.create(payload), onSuccess: invalidateUsers });
  const updateUser = useMutation({ mutationFn: ({ userId, payload }: { userId: number; payload: UserUpdate }) => usersApi.update(userId, payload), onSuccess: invalidateUsers });
  const resetUserPassword = useMutation({ mutationFn: ({ userId, new_password }: { userId: number; new_password: string }) => usersApi.resetPassword(userId, { new_password }) });
  const setUserStatus = useMutation({
    mutationFn: ({ user, is_active }: { user: UserOut; is_active: boolean }) => usersApi.setStatus(user.id, { is_active }),
    onSuccess: invalidateUsers,
  });
  const bulkCsv = useMutation({
    mutationFn: (file: File) => usersApi.bulkCsv(file),
    onSuccess: () => {
      setCsvErrors([]);
      setCsvOpen(false);
      invalidateUsers();
    },
    onError: (error) => setCsvErrors(extractBulkErrors(error)),
  });

  const filteredUsers = useMemo(
    () => (users.data?.items ?? []).filter((user) => userMatches(user, search, role, status, groupId)),
    [groupId, role, search, status, users.data?.items],
  );

  async function handleCsvFile(file: File | null) {
    setCsvFile(file);
    setCsvErrors([]);
    if (!file) {
      setCsvPreview([]);
      return;
    }
    setCsvPreview(parseCsvPreview(await readFileText(file)));
  }

  async function submitCreate() {
    await createUser.mutateAsync({
      username: createForm.username,
      password: createForm.password,
      full_name: createForm.full_name,
      role_id: roleIds[createForm.role],
      group_id: createForm.group_id === 'none' ? null : Number(createForm.group_id),
    });
    setCreateOpen(false);
    setCreateForm(emptyCreateForm);
  }

  async function submitEdit() {
    if (!editTarget) return;
    await updateUser.mutateAsync({ userId: editTarget.id, payload: editForm });
    setEditTarget(null);
    setEditForm({});
  }

  async function submitResetPassword() {
    if (!resetTarget) return;
    await resetUserPassword.mutateAsync({ userId: resetTarget.id, new_password: resetPassword });
    setResetTarget(null);
    setResetPassword('');
  }

  if (users.isLoading || groups.isLoading) return <Skeleton rows={6} label="Loading table" />;

  if (users.isError || groups.isError) {
    return <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-4 text-danger">Не удалось загрузить пользователей.</div>;
  }

  const groupOptions = groups.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-danger">Admin users</p>
          <h1 className="text-3xl font-bold text-fg">Пользователи</h1>
          <p className="mt-1 text-sm text-fg-muted">Поиск, фильтры, CSV-импорт и административные действия.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setCsvOpen(true)}>Импорт из CSV</Button>
          <Button onClick={() => setCreateOpen(true)}>Создать пользователя</Button>
        </div>
      </header>

      <Card>
        <div className="grid gap-4 md:grid-cols-4">
          <Input label="Поиск" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Логин или ФИО" />
          <SelectField label="Роль" value={role} onChange={setRole}>
            <option value="all">Все роли</option>
            <option value="student">Студент</option>
            <option value="teacher">Преподаватель</option>
            <option value="admin">Администратор</option>
          </SelectField>
          <SelectField label="Статус" value={status} onChange={setStatus}>
            <option value="all">Все статусы</option>
            <option value="active">Активен</option>
            <option value="locked">Заблокирован</option>
          </SelectField>
          <SelectField label="Группа" value={groupId} onChange={setGroupId}>
            <option value="all">Все группы</option>
            {groupOptions.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </SelectField>
        </div>
      </Card>

      <Table
        data={filteredUsers}
        getRowKey={(user) => user.id}
        emptyMessage="Пользователи не найдены"
        columns={[
          { key: 'username', header: 'Логин' },
          { key: 'full_name', header: 'ФИО' },
          { key: 'role', header: 'Роль', render: (user) => roleLabels[user.role] },
          { key: 'group_name', header: 'Группа', render: (user) => user.group_name ?? '—' },
          { key: 'status', header: 'Статус', render: (user) => <Badge variant={user.is_active ? 'success' : 'danger'}>{user.is_active ? 'Активен' : 'Заблокирован'}</Badge> },
          { key: 'last_login_at', header: 'Последний вход', render: (user) => formatDateTime(user.last_login_at) },
          {
            key: 'actions',
            header: 'Действия',
            render: (user) => (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setEditTarget(user); setEditForm({ full_name: user.full_name, group_id: user.group_id }); }}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => setResetTarget(user)}>Reset password</Button>
                <Button size="sm" variant="secondary" onClick={() => setUserStatus.mutate({ user, is_active: !user.is_active })}>{user.is_active ? 'Block' : 'Unblock'}</Button>
                <Button size="sm" variant="danger" onClick={() => setDeleteTarget(user)}>Delete</Button>
              </div>
            ),
          },
        ]}
      />

      <Modal
        open={createOpen}
        title="Создать пользователя"
        onClose={() => setCreateOpen(false)}
        footer={<><Button variant="secondary" onClick={() => setCreateOpen(false)}>Отмена</Button><Button onClick={() => void submitCreate()} isLoading={createUser.isPending}>Создать</Button></>}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Логин" value={createForm.username} onChange={(event) => setCreateForm((current) => ({ ...current, username: event.target.value }))} />
          <Input label="Пароль" type="password" value={createForm.password} onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))} />
          <Input label="ФИО" value={createForm.full_name} onChange={(event) => setCreateForm((current) => ({ ...current, full_name: event.target.value }))} />
          <SelectField label="Роль пользователя" value={createForm.role} onChange={(value) => setCreateForm((current) => ({ ...current, role: value as UserRole }))}>
            <option value="student">Студент</option>
            <option value="teacher">Преподаватель</option>
            <option value="admin">Администратор</option>
          </SelectField>
          <SelectField label="Группа пользователя" value={createForm.group_id} onChange={(value) => setCreateForm((current) => ({ ...current, group_id: value }))}>
            <option value="none">Без группы</option>
            {groupOptions.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </SelectField>
        </div>
      </Modal>

      <Modal
        open={Boolean(editTarget)}
        title="Редактировать пользователя"
        onClose={() => setEditTarget(null)}
        footer={<><Button variant="secondary" onClick={() => setEditTarget(null)}>Отмена</Button><Button onClick={() => void submitEdit()} isLoading={updateUser.isPending}>Сохранить</Button></>}
      >
        <div className="space-y-4">
          <Input label="ФИО" value={editForm.full_name ?? ''} onChange={(event) => setEditForm((current) => ({ ...current, full_name: event.target.value }))} />
          <SelectField label="Группа пользователя" value={String(editForm.group_id ?? 'none')} onChange={(value) => setEditForm((current) => ({ ...current, group_id: value === 'none' ? null : Number(value) }))}>
            <option value="none">Без группы</option>
            {groupOptions.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </SelectField>
        </div>
      </Modal>

      <Modal
        open={csvOpen}
        title="Импорт из CSV"
        onClose={() => setCsvOpen(false)}
        footer={<><Button variant="secondary" onClick={() => setCsvOpen(false)}>Отмена</Button><Button onClick={() => csvFile && bulkCsv.mutate(csvFile)} disabled={!csvFile} isLoading={bulkCsv.isPending}>Загрузить CSV</Button></>}
      >
        <div className="space-y-4">
          <a className="focus-ring inline-flex rounded text-sm font-medium text-royal hover:text-cyan" href={`data:text/csv;charset=utf-8,${encodeURIComponent(templateCsv)}`} download="users_template.csv">
            Скачать шаблон CSV
          </a>
          <label className="block space-y-2 rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-fg">
            <span className="font-medium">CSV файл</span>
            <input aria-label="CSV файл" type="file" accept=".csv,text/csv" onChange={(event) => void handleCsvFile(event.target.files?.[0] ?? null)} />
          </label>
          {csvPreview.length ? (
            <div>
              <p className="text-sm font-semibold text-fg">Preview первых 10 строк</p>
              <Table
                data={csvPreview}
                getRowKey={(row) => row.row}
                columns={[
                  { key: 'row', header: 'Строка' },
                  { key: 'username', header: 'Логин' },
                  { key: 'full_name', header: 'ФИО' },
                  { key: 'role', header: 'Роль' },
                  { key: 'group_name', header: 'Группа' },
                ]}
              />
            </div>
          ) : null}
          {csvErrors.length ? (
            <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
              <p className="font-semibold">Ошибки импорта</p>
              <ul className="mt-2 space-y-1">
                {csvErrors.map((error, index) => <li key={`${error.row}-${index}`}>Строка {error.row}: {error.detail}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(resetTarget)}
        title="Сбросить пароль"
        onClose={() => setResetTarget(null)}
        footer={<><Button variant="secondary" onClick={() => setResetTarget(null)}>Отмена</Button><Button onClick={() => void submitResetPassword()} disabled={!resetPassword} isLoading={resetUserPassword.isPending}>Сбросить пароль</Button></>}
      >
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">Новый пароль для {resetTarget?.full_name}. Пользователь будет обязан сменить пароль при входе.</p>
          <Input label="Новый пароль" type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Удалить пользователя"
        description={`Пользователь ${deleteTarget?.full_name ?? ''} будет заблокирован. Это безопасный soft-delete fallback до отдельного backend DELETE endpoint.`}
        confirmLabel="Delete"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) setUserStatus.mutate({ user: deleteTarget, is_active: false });
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}