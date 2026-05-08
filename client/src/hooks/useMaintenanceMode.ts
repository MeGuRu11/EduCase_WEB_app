import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
import { useAuthStore } from '@/stores/authStore';

export function useMaintenanceModePolling() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setMaintenanceMode = useAuthStore((state) => state.setMaintenanceMode);

  const query = useQuery({
    enabled: isAuthenticated && user?.role === 'admin',
    queryKey: ['admin', 'maintenance-mode'],
    queryFn: () => adminApi.sysinfo(),
    refetchInterval: 5_000,
    retry: false,
  });

  useEffect(() => {
    if (query.data) setMaintenanceMode(query.data.maintenance_mode);
  }, [query.data, setMaintenanceMode]);

  return query;
}