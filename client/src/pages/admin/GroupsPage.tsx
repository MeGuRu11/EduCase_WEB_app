import { useMemo, useState, type FormEvent } from 'react';
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
import { notify } from '@/components/ui/Toast';
import type { GroupCreate, GroupOut, GroupUpdate } from '@/types/group';
import type { UserOut } from '@/types/user';

interface CreateForm {
  name: string;
  description: string;
}

interface EditForm {
  name: string;
  description: string;
  is_active: boolean;
}

const emptyCreateForm: CreateForm = { name: '', description: '' };

function extractError(error: unknown, fallback: string): string {
  if (error instanceof AxiosError) {
    const detail = (error.response?.data as { detail?: string } | undefined)?.detail;
    if (typeof detail === 'string' && detail) return detail;
  }
  return fallback;
}

export default function GroupsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm);
  const [createError, setCreateError] = useState('');
  const [editTarget, setEditTarget] = useState<GroupOut | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', description: '', is_active: true });
  const [editError, setEditError] = useState('');
  const [membersTarget, setMembersTarget] = useState<GroupOut | null>(null);
  const [memberPickerId, setMemberPickerId] = useState('');
  const [teachersTarget, setTeachersTarget] = useState<GroupOut | null>(null);
  const [teacherPickerId, setTeacherPickerId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<GroupOut | null>(null);

  const groups = useQuery({ queryKey: ['admin', 'groups'], queryFn: () => groupsApi.list() });
  const allUsers = useQuery({
    queryKey: ['admin', 'users', 'all-for-groups'],
    queryFn: () => usersApi.list({ per_page: 100 }),
  });

  const invalidateGroups = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'groups'] });
    void queryClient.invalidateQueries({ queryKey: ['groups'] });
  };

  const createGroup = useMutation({
    mutationFn: (payload: GroupCreate) => groupsApi.create(payload),
    onSuccess: () => {
      notify.success('Группа создана');
      setCreateOpen(false);
      setCreateForm(emptyCreateForm);
      setCreateError('');
      invalidateGroups();
    },
    onError: (error) => setCreateError(extractError(error, 'Не удалось создать группу')),
  });

  const updateGroup = useMutation({
    mutationFn: ({ groupId, payload }: { groupId: number; payload: GroupUpdate }) =>
      groupsApi.update(groupId, payload),
    onSuccess: () => {
      notify.success('Группа обновлена');
      setEditTarget(null);
      setEditError('');
      invalidateGroups();
    },
    onError: (error) => setEditError(extractError(error, 'Не удалось обновить группу')),
  });

  const deleteGroup = useMutation({
    mutationFn: (groupId: number) => groupsApi.remove(groupId),
    onSuccess: () => {
      notify.success('Группа удалена');
      setDeleteTarget(null);
      invalidateGroups();
    },
    onError: (error) => notify.error(extractError(error, 'Не удалось удалить группу')),
  });

  const addMember = useMutation({
    mutationFn: ({ groupId, userId }: { groupId: number; userId: number }) =>
      groupsApi.addMember(groupId, { user_id: userId }),
    onSuccess: () => {
      notify.success('Студент добавлен');
      setMemberPickerId('');
      invalidateGroups();
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error) => notify.error(extractError(error, 'Не удалось добавить студента')),
  });

  const removeMember = useMutation({
    mutationFn: ({ groupId, userId }: { groupId: number; userId: number }) =>
      groupsApi.removeMember(groupId, userId),
    onSuccess: () => {
      notify.success('Студент исключён из группы');
      invalidateGroups();
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error) => notify.error(extractError(error, 'Не удалось убрать студента')),
  });

  const assignTeacher = useMutation({
    mutationFn: ({ groupId, teacherId }: { groupId: number; teacherId: number }) =>
      groupsApi.assignTeacher(groupId, { teacher_id: teacherId }),
    onSuccess: () => {
      notify.success('Преподаватель назначен');
      setTeacherPickerId('');
      invalidateGroups();
    },
    onError: (error) => notify.error(extractError(error, 'Не удалось назначить преподавателя')),
  });

  const removeTeacher = useMutation({
    mutationFn: ({ groupId, teacherId }: { groupId: number; teacherId: number }) =>
      groupsApi.removeTeacher(groupId, teacherId),
    onSuccess: () => {
      notify.success('Преподаватель снят с группы');
      invalidateGroups();
    },
    onError: (error) => notify.error(extractError(error, 'Не удалось убрать преподавателя')),
  });

  const usersById = useMemo(() => {
    const map = new Map<number, UserOut>();
    for (const user of allUsers.data?.items ?? []) map.set(user.id, user);
    return map;
  }, [allUsers.data]);

  const studentsInGroup = (group: GroupOut) =>
    (allUsers.data?.items ?? []).filter((u) => u.role === 'student' && u.group_id === group.id);

  const studentsNotInGroup = (group: GroupOut) =>
    (allUsers.data?.items ?? []).filter(
      (u) => u.role === 'student' && u.is_active && u.group_id !== group.id,
    );

  const teachersNotInGroup = (group: GroupOut) => {
    const assignedIds = new Set(group.teachers.map((t) => t.id));
    return (allUsers.data?.items ?? []).filter(
      (u) => u.role === 'teacher' && u.is_active && !assignedIds.has(u.id),
    );
  };

  const filteredGroups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return groups.data ?? [];
    return (groups.data ?? []).filter(
      (g) =>
        g.name.toLowerCase().includes(needle) ||
        (g.description ?? '').toLowerCase().includes(needle),
    );
  }, [groups.data, search]);

  function openCreate() {
    setCreateForm(emptyCreateForm);
    setCreateError('');
    setCreateOpen(true);
  }

  function submitCreate(event: FormEvent) {
    event.preventDefault();
    const name = createForm.name.trim();
    if (name.length < 2) {
      setCreateError('Название группы должно содержать минимум 2 символа');
      return;
    }
    createGroup.mutate({
      name,
      description: createForm.description.trim() || null,
    });
  }

  function openEdit(group: GroupOut) {
    setEditTarget(group);
    setEditForm({
      name: group.name,
      description: group.description ?? '',
      is_active: group.is_active,
    });
    setEditError('');
  }

  function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editTarget) return;
    const name = editForm.name.trim();
    if (name.length < 2) {
      setEditError('Название группы должно содержать минимум 2 символа');
      return;
    }
    updateGroup.mutate({
      groupId: editTarget.id,
      payload: {
        name,
        description: editForm.description.trim() || null,
        is_active: editForm.is_active,
      },
    });
  }

  if (groups.isLoading || allUsers.isLoading) return <Skeleton rows={6} label="Загрузка таблицы" />;

  if (groups.isError) {
    return (
      <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-4 text-danger-ink">
        Не удалось загрузить группы.
      </div>
    );
  }

  const membersInDialog = membersTarget ? studentsInGroup(membersTarget) : [];
  const candidateStudents = membersTarget ? studentsNotInGroup(membersTarget) : [];
  const candidateTeachers = teachersTarget ? teachersNotInGroup(teachersTarget) : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-danger-ink">
            АДМИНИСТРАТОР: ГРУППЫ
          </p>
          <h1 className="text-3xl font-bold text-fg">Учебные группы</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Создание групп, назначение преподавателей и зачисление студентов.
          </p>
        </div>
        <Button onClick={openCreate}>Создать группу</Button>
      </header>

      <Card title="Список групп">
        <div className="mb-4 max-w-sm">
          <Input
            label="Поиск"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="По названию или описанию"
          />
        </div>

        <Table
          data={filteredGroups}
          getRowKey={(group) => group.id}
          emptyMessage="Групп пока нет"
          columns={[
            {
              key: 'name',
              header: 'Название',
              render: (group) => (
                <div className="space-y-1">
                  <p className="font-medium text-fg">{group.name}</p>
                  {group.description ? (
                    <p className="text-xs text-fg-muted">{group.description}</p>
                  ) : null}
                </div>
              ),
            },
            {
              key: 'student_count',
              header: 'Студентов',
              render: (group) => <span className="text-fg">{group.student_count}</span>,
            },
            {
              key: 'teachers',
              header: 'Преподаватели',
              render: (group) =>
                group.teachers.length ? (
                  <ul className="space-y-1 text-sm text-fg">
                    {group.teachers.map((teacher) => (
                      <li key={teacher.id}>{teacher.full_name}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-sm text-fg-muted">Не назначены</span>
                ),
            },
            {
              key: 'is_active',
              header: 'Статус',
              render: (group) => (
                <Badge variant={group.is_active ? 'success' : 'neutral'}>
                  {group.is_active ? 'Активна' : 'Архив'}
                </Badge>
              ),
            },
            {
              key: 'actions',
              header: 'Действия',
              render: (group) => (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(group)}>
                    Редактировать
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setMembersTarget(group)}>
                    Студенты
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setTeachersTarget(group)}>
                    Преподаватели
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleteTarget(group)}>
                    Удалить
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={createOpen}
        title="Новая группа"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button onClick={submitCreate} isLoading={createGroup.isPending}>
              Создать
            </Button>
          </>
        }
      >
        <form onSubmit={submitCreate} className="space-y-4">
          <Input
            label="Название"
            value={createForm.name}
            onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
            required
            autoFocus
          />
          <Input
            label="Описание (необязательно)"
            value={createForm.description}
            onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })}
          />
          {createError ? (
            <p role="alert" className="text-sm text-danger-ink">
              {createError}
            </p>
          ) : null}
        </form>
      </Modal>

      <Modal
        open={editTarget !== null}
        title={editTarget ? `Редактировать «${editTarget.name}»` : 'Редактирование'}
        onClose={() => setEditTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>
              Отмена
            </Button>
            <Button onClick={submitEdit} isLoading={updateGroup.isPending}>
              Сохранить
            </Button>
          </>
        }
      >
        <form onSubmit={submitEdit} className="space-y-4">
          <Input
            label="Название"
            value={editForm.name}
            onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
          />
          <Input
            label="Описание"
            value={editForm.description}
            onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
          />
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={editForm.is_active}
              onChange={(event) => setEditForm({ ...editForm, is_active: event.target.checked })}
            />
            Группа активна
          </label>
          {editError ? (
            <p role="alert" className="text-sm text-danger-ink">
              {editError}
            </p>
          ) : null}
        </form>
      </Modal>

      <Modal
        open={membersTarget !== null}
        title={membersTarget ? `Студенты группы «${membersTarget.name}»` : 'Студенты'}
        onClose={() => {
          setMembersTarget(null);
          setMemberPickerId('');
        }}
        footer={
          <Button variant="secondary" onClick={() => setMembersTarget(null)}>
            Закрыть
          </Button>
        }
      >
        <div className="space-y-4">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-fg">В группе</h3>
            {membersInDialog.length ? (
              <ul className="space-y-2">
                {membersInDialog.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center justify-between rounded border border-border bg-bg px-3 py-2 text-sm"
                  >
                    <span className="text-fg">
                      {member.full_name}{' '}
                      <span className="text-fg-muted">({member.username})</span>
                    </span>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        membersTarget &&
                        removeMember.mutate({ groupId: membersTarget.id, userId: member.id })
                      }
                      isLoading={
                        removeMember.isPending &&
                        removeMember.variables?.userId === member.id
                      }
                    >
                      Убрать
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-muted">В группе пока нет студентов.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-fg">Добавить студента</h3>
            {candidateStudents.length ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="block flex-1 space-y-1.5 text-sm font-medium text-fg">
                  <span>Студент</span>
                  <select
                    aria-label="Студент"
                    className="h-10 w-full rounded border border-border bg-bg px-3 text-sm text-fg focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/40"
                    value={memberPickerId}
                    onChange={(event) => setMemberPickerId(event.target.value)}
                  >
                    <option value="">— выбрать —</option>
                    {candidateStudents.map((candidate) => {
                      const currentGroup = candidate.group_id
                        ? usersById.get(candidate.id)?.group_name ?? null
                        : null;
                      return (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.full_name} ({candidate.username})
                          {currentGroup ? ` · ${currentGroup}` : ''}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <Button
                  onClick={() => {
                    if (!membersTarget || !memberPickerId) return;
                    addMember.mutate({
                      groupId: membersTarget.id,
                      userId: Number(memberPickerId),
                    });
                  }}
                  disabled={!memberPickerId}
                  isLoading={addMember.isPending}
                >
                  Добавить
                </Button>
              </div>
            ) : (
              <p className="text-sm text-fg-muted">
                Нет студентов вне этой группы. Создайте их на странице «Пользователи».
              </p>
            )}
          </section>
        </div>
      </Modal>

      <Modal
        open={teachersTarget !== null}
        title={teachersTarget ? `Преподаватели группы «${teachersTarget.name}»` : 'Преподаватели'}
        onClose={() => {
          setTeachersTarget(null);
          setTeacherPickerId('');
        }}
        footer={
          <Button variant="secondary" onClick={() => setTeachersTarget(null)}>
            Закрыть
          </Button>
        }
      >
        <div className="space-y-4">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-fg">Назначены</h3>
            {teachersTarget && teachersTarget.teachers.length ? (
              <ul className="space-y-2">
                {teachersTarget.teachers.map((teacher) => (
                  <li
                    key={teacher.id}
                    className="flex items-center justify-between rounded border border-border bg-bg px-3 py-2 text-sm"
                  >
                    <span className="text-fg">{teacher.full_name}</span>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        teachersTarget &&
                        removeTeacher.mutate({
                          groupId: teachersTarget.id,
                          teacherId: teacher.id,
                        })
                      }
                      isLoading={
                        removeTeacher.isPending &&
                        removeTeacher.variables?.teacherId === teacher.id
                      }
                    >
                      Снять
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-muted">Группа без преподавателя.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-fg">Назначить</h3>
            {candidateTeachers.length ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="block flex-1 space-y-1.5 text-sm font-medium text-fg">
                  <span>Преподаватель</span>
                  <select
                    aria-label="Преподаватель"
                    className="h-10 w-full rounded border border-border bg-bg px-3 text-sm text-fg focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/40"
                    value={teacherPickerId}
                    onChange={(event) => setTeacherPickerId(event.target.value)}
                  >
                    <option value="">— выбрать —</option>
                    {candidateTeachers.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.full_name} ({candidate.username})
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  onClick={() => {
                    if (!teachersTarget || !teacherPickerId) return;
                    assignTeacher.mutate({
                      groupId: teachersTarget.id,
                      teacherId: Number(teacherPickerId),
                    });
                  }}
                  disabled={!teacherPickerId}
                  isLoading={assignTeacher.isPending}
                >
                  Назначить
                </Button>
              </div>
            ) : (
              <p className="text-sm text-fg-muted">
                Нет свободных преподавателей. Создайте их на странице «Пользователи».
              </p>
            )}
          </section>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Удалить группу"
        description={
          deleteTarget
            ? `Группа «${deleteTarget.name}» будет удалена без возможности восстановления. Удалить можно только пустую группу.`
            : ''
        }
        confirmLabel="Удалить"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteGroup.mutate(deleteTarget.id)}
      />
    </div>
  );
}
