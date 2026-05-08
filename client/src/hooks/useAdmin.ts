import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, type SystemLogParams } from '@/api/admin';
import type { LogLevel, SystemSettingUpdate } from '@/types/admin';

export const adminKeys = {
  all: ['admin'] as const,
  stats: () => [...adminKeys.all, 'stats'] as const,
  health: () => [...adminKeys.all, 'health'] as const,
  sysinfo: () => [...adminKeys.all, 'sysinfo'] as const,
  settings: () => [...adminKeys.all, 'settings'] as const,
  backups: () => [...adminKeys.all, 'backups'] as const,
  logs: (params: SystemLogParams = {}) =>
    [...adminKeys.all, 'logs', params.level ?? 'all', params.page ?? 1, params.per_page ?? 50] as const,
};

export function useAdminStats() {
  return useQuery({ queryKey: adminKeys.stats(), queryFn: () => adminApi.stats() });
}

export function useAdminHealth() {
  return useQuery({
    queryKey: adminKeys.health(),
    queryFn: () => adminApi.health(),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });
}

export function useAdminSysinfo(refetchInterval?: number | false) {
  return useQuery({
    queryKey: adminKeys.sysinfo(),
    queryFn: () => adminApi.sysinfo(),
    refetchInterval,
  });
}

export function useAdminSettings() {
  return useQuery({ queryKey: adminKeys.settings(), queryFn: () => adminApi.settings() });
}

export function useUpdateAdminSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SystemSettingUpdate) => adminApi.updateSettings(payload),
    onSuccess: (settings) => {
      queryClient.setQueryData(adminKeys.settings(), settings);
      void queryClient.invalidateQueries({ queryKey: adminKeys.sysinfo() });
    },
  });
}

export function useAdminBackups() {
  return useQuery({ queryKey: adminKeys.backups(), queryFn: () => adminApi.backups() });
}

export function useCreateBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => adminApi.createBackup(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: adminKeys.backups() }),
  });
}

export function useDeleteBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (filename: string) => adminApi.deleteBackup(filename),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: adminKeys.backups() }),
  });
}

export function useRestoreBackup() {
  return useMutation({ mutationFn: (filename: string) => adminApi.restoreBackup(filename) });
}

export function useAdminLogs(level: LogLevel | 'all' = 'all', page = 1, perPage = 50) {
  return useQuery({
    queryKey: adminKeys.logs({ level, page, per_page: perPage }),
    queryFn: () => adminApi.logs({ level, page, per_page: perPage }),
  });
}