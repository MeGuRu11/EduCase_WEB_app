import { useAuthStore } from '@/stores/authStore';

export default function MaintenanceBanner() {
  const maintenanceMode = useAuthStore((state) => state.maintenanceMode);

  if (!maintenanceMode) return null;

  return (
    <div role="alert" className="bg-danger px-6 py-3 text-center text-sm font-semibold text-white">
      ⚠ Идёт восстановление системы. Сохраните свои данные и обновите страницу через 5 минут.
    </div>
  );
}